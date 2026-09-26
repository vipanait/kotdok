import { describe, expect, it } from 'vitest'
import type { HealthEvent } from '@lapka/contracts'
import {
  completionMismatch,
  coreVaccinations,
  eventDayProblem,
  fallbackInterval,
  nextDayProblem,
  nextDayOf,
  suggestNextDay,
  toggleParasiteGroup,
  vaccineTargetsFor,
} from './event-entry'

function event(partial: Partial<HealthEvent> & Pick<HealthEvent, 'id' | 'status' | 'date' | 'items'>): HealthEvent {
  return {
    kind: 'vaccination',
    clinic: null,
    notes: null,
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
    ...partial,
  }
}

function item(id: string, targets: string[], source_item_id: string | null = null) {
  return { id, name: null, targets, source_item_id, product_id: null, interval: null, instructions: null, medication_id: null }
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('vaccination targets', () => {
  it('lists a species’ own diseases, core first, and never another species’', () => {
    expect(vaccineTargetsFor('cat')).toEqual(['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies', 'felv', 'chlamydia'])
    const dog = vaccineTargetsFor('dog')
    expect(dog.slice(0, 4)).toEqual(['distemper', 'parvovirus', 'adenovirus', 'rabies'])
    expect(dog).not.toContain('panleukopenia')
  })
})

describe('parasite groups', () => {
  it('switches a whole group: ear mites go with ticks', () => {
    expect(toggleParasiteGroup(['fleas', 'ear_mites'], 'ticks')).toEqual(['fleas'])
    expect(toggleParasiteGroup(['fleas'], 'worms')).toEqual(['fleas', 'worms'])
  })
})

describe('suggested next date', () => {
  it('follows the catalogue interval, weeks as weeks', () => {
    expect(suggestNextDay('2026-09-24', { value: 12, unit: 'week' }, '2026-09-24')).toBe('2026-12-17')
    expect(suggestNextDay('2026-09-24', { value: 1, unit: 'year' }, '2026-09-24')).toBe('2027-09-24')
  })

  it('suggests nothing without an interval, or when the date would already be past', () => {
    expect(suggestNextDay('2026-09-24', null, '2026-09-24')).toBeNull()
    expect(suggestNextDay('2024-03-12', { value: 1, unit: 'year' }, '2026-09-24')).toBeNull()
  })

  it('falls back to a year for a vaccine, three months for worms alone, a month otherwise (phone)', () => {
    expect(fallbackInterval('vaccination', [])).toEqual({ value: 1, unit: 'year' })
    expect(fallbackInterval('parasite', ['worms'])).toEqual({ value: 3, unit: 'month' })
    expect(fallbackInterval('parasite', ['worms', 'fleas'])).toEqual({ value: 1, unit: 'month' })
  })
})

describe('record and next days (MR-03.3)', () => {
  const today = '2026-09-24'

  it('keeps a done record out of the future and a plan out of the past', () => {
    expect(eventDayProblem('2026-09-24', 'done', today)).toBeNull()
    expect(eventDayProblem('2026-09-25', 'done', today)).toBe('future')
    expect(eventDayProblem('2026-09-24', 'planned', today)).toBeNull()
    expect(eventDayProblem('2026-09-23', 'planned', today)).toBe('past')
  })

  it('lets an overdue plan keep its own day, not move to another past one', () => {
    expect(eventDayProblem('2026-09-12', 'planned', today, '2026-09-12')).toBeNull()
    expect(eventDayProblem('2026-09-13', 'planned', today, '2026-09-12')).toBe('past')
  })

  it('reads the day as the contract does: empty, or not a real day', () => {
    expect(eventDayProblem('', 'done', today)).toBe('empty')
    expect(eventDayProblem('2026-02-30', 'done', today)).toBe('invalid')
    expect(eventDayProblem('24.09.2026', 'done', today)).toBe('invalid')
  })

  it('wants a next date after the record and not in the past', () => {
    expect(nextDayProblem('2027-09-24', '2026-09-24', today)).toBeNull()
    expect(nextDayProblem('2026-09-24', '2026-09-24', today)).toBe('notAfter')
    expect(nextDayProblem('2026-09-20', '2026-09-10', today)).toBe('past')
    expect(nextDayProblem('2026-13-01', '2026-09-10', today)).toBe('invalid')
    expect(nextDayProblem('2026-09-30', null, today)).toBeNull()
  })
})

describe('core vaccinations', () => {
  const done = event({ id: uuid(1), status: 'done', date: '2026-03-12', items: [item(uuid(11), ['panleukopenia', 'calicivirus']), item(uuid(12), ['rabies'])] })
  const older = event({ id: uuid(2), status: 'done', date: '2025-03-12', items: [item(uuid(21), ['rabies'])] })
  const plan = event({ id: uuid(3), status: 'planned', date: '2027-03-12', items: [item(uuid(31), ['rabies'], uuid(12))] })
  const parasite = event({ id: uuid(4), kind: 'parasite', status: 'done', date: '2026-06-01', items: [item(uuid(41), ['fleas'])] })

  it('gives each core disease of the species its next plan and its last done day', () => {
    expect(coreVaccinations('cat', [done, older, plan, parasite])).toEqual([
      { target: 'panleukopenia', next: null, last: '2026-03-12' },
      { target: 'calicivirus', next: null, last: '2026-03-12' },
      { target: 'rhinotracheitis', next: null, last: null },
      { target: 'rabies', next: '2027-03-12', last: '2026-03-12' },
    ])
  })

  it('has no dates at all when there are no records, whatever the form says', () => {
    expect(coreVaccinations('dog', []).map((core) => [core.target, core.next, core.last])).toEqual([
      ['distemper', null, null],
      ['parvovirus', null, null],
      ['adenovirus', null, null],
      ['rabies', null, null],
    ])
  })

  it('finds the plan a done item was followed by', () => {
    expect(nextDayOf(uuid(12), [done, plan])).toBe('2027-03-12')
    expect(nextDayOf(uuid(11), [done, plan])).toBeNull()
  })
})

describe('«Сделано» answered with an earlier record (web and phone, MW-08)', () => {
  const planItem = item(uuid(1), ['fleas'])
  const input = { done_on: '2026-09-24', next_on: '2026-12-17' }
  const saved = event({ id: uuid(2), status: 'done', date: '2026-09-24', items: [planItem] })
  const next = (date: string) => event({ id: uuid(3), status: 'planned', date, items: [item(uuid(4), ['fleas'], planItem.id)] })

  it('takes a 200 as success only when the record is the one sent', () => {
    expect(completionMismatch(input, saved, planItem.id, [saved, next('2026-12-17')])).toBeNull()
    expect(completionMismatch(input, { date: '2026-09-26' }, planItem.id, null)).toBe('doneOn')
    expect(completionMismatch(input, saved, planItem.id, [saved, next('2026-12-19')])).toBe('next')
    expect(completionMismatch(input, saved, planItem.id, [saved])).toBe('next')
    expect(completionMismatch({ ...input, next_on: null }, saved, planItem.id, [saved, next('2026-12-17')])).toBe('next')
    expect(completionMismatch({ done_on: '2026-09-24' }, saved, planItem.id, [saved])).toBeNull()
  })

  it('lets the day decide when the record could not be read again', () => {
    expect(completionMismatch(input, saved, planItem.id, null)).toBeNull()
  })
})
