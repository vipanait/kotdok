import { describe, expect, it } from 'vitest'
import { VISIT_LIMITS } from '@lapka/contracts'
import { eventDayProblem } from './event-entry'
import { CHECK_LINK_DAYS, heldVisitDay, linkableChecks, prescriptionProblems, reasonFromCheck, visitEditable, visitTextProblems } from './visit-entry'

// MW-06: the visit rules the site and the phone share. A visit that happened
// is only read; a plan is changed, moved or marked held. The checks a visit
// may be linked to are the last 30 days' plus the one it already has.

const TODAY = '2026-09-26'
const utcDay = (iso: string) => iso.slice(0, 10)

describe('which visit can change', () => {
  it('a plan can; a visit that happened cannot', () => {
    expect(visitEditable({ status: 'planned' })).toBe(true)
    expect(visitEditable({ status: 'done' })).toBe(false)
  })

  it('its day follows the record rules: held not after today, a plan not before, a kept day stays', () => {
    expect(eventDayProblem('2026-09-27', 'done', TODAY)).toBe('future')
    expect(eventDayProblem(TODAY, 'done', TODAY)).toBeNull()
    expect(eventDayProblem('2026-09-25', 'planned', TODAY)).toBe('past')
    // An overdue plan corrected in another field keeps its own day.
    expect(eventDayProblem('2026-09-20', 'planned', TODAY, '2026-09-20')).toBeNull()
  })
})

describe('the day «Состоялся» starts with', () => {
  it('is the planned day once it has come, otherwise today', () => {
    expect(heldVisitDay('2026-09-20', TODAY)).toBe('2026-09-20')
    expect(heldVisitDay(TODAY, TODAY)).toBe(TODAY)
    expect(heldVisitDay('2026-10-03', TODAY)).toBe(TODAY)
  })
})

describe('what is wrong with a prescription or a text', () => {
  it('needs a name; the name and «как принимать» have the contract’s limits', () => {
    expect(prescriptionProblems({ name: '  ', instructions: '' })).toEqual({ name: 'empty' })
    expect(prescriptionProblems({ name: 'Ф'.repeat(VISIT_LIMITS.prescriptionName), instructions: '' })).toEqual({})
    expect(prescriptionProblems({ name: 'Ф'.repeat(VISIT_LIMITS.prescriptionName + 1), instructions: '' })).toEqual({ name: 'tooLong' })
    expect(prescriptionProblems({ name: 'Фортифлора', instructions: 'x'.repeat(VISIT_LIMITS.instructions + 1) })).toEqual({
      instructions: 'tooLong',
    })
  })

  it('names the texts that are too long: clinic 100, reason and diagnosis 500, note 300', () => {
    expect(VISIT_LIMITS).toMatchObject({ clinic: 100, reason: 500, diagnosis: 500, notes: 300, prescriptionName: 100, instructions: 150, prescriptions: 10 })
    expect(visitTextProblems({ clinic: 'к'.repeat(100), reason: 'р'.repeat(500), diagnosis: 'д'.repeat(500), notes: 'з'.repeat(300) })).toEqual([])
    expect(visitTextProblems({ clinic: 'к'.repeat(101), reason: 'р'.repeat(501), diagnosis: 'д'.repeat(501), notes: 'з'.repeat(301) })).toEqual([
      'clinic',
      'reason',
      'diagnosis',
      'notes',
    ])
  })
})

describe('which checks a visit may be linked to', () => {
  const check = (id: string, created_at: string) => ({ id, created_at })
  const checks = [
    check('today', '2026-09-26T08:00:00Z'),
    check('edge', '2026-08-27T10:00:00Z'),
    check('old', '2026-08-26T10:00:00Z'),
    check('august', '2026-08-01T09:30:00Z'),
  ]

  it('the last 30 days by the owner’s day, newest first as given', () => {
    expect(CHECK_LINK_DAYS).toBe(30)
    expect(linkableChecks(checks, TODAY, null, utcDay).map((c) => c.id)).toEqual(['today', 'edge'])
  })

  it('keeps the check a visit is already linked to, however old', () => {
    expect(linkableChecks(checks, TODAY, 'august', utcDay).map((c) => c.id)).toEqual(['today', 'edge', 'august'])
  })

  it('counts the owner’s day, not UTC: 23:30 UTC on 26 August is the 27th in Moscow', () => {
    const late = [check('late', '2026-08-26T23:30:00Z')]
    expect(linkableChecks(late, TODAY, null, utcDay)).toEqual([])
    const moscow = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10)
    expect(linkableChecks(late, TODAY, null, moscow).map((c) => c.id)).toEqual(['late'])
  })
})

describe('the reason of a visit written from a check result', () => {
  it('is the first line the owner typed, trimmed to the visit’s limit', () => {
    expect(reasonFromCheck('Рвота два дня, отказ от еды')).toBe('Рвота два дня, отказ от еды')
    expect(reasonFromCheck('\n  Хромает на левую лапу  \nс утра')).toBe('Хромает на левую лапу')
    expect(reasonFromCheck('')).toBe('')
    expect(reasonFromCheck('а'.repeat(600))).toHaveLength(VISIT_LIMITS.reason)
  })
})
