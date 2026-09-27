import { describe, expect, it } from 'vitest'
import { VISIT_LIMITS, type HealthEvent } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { dueItems, itemTitle } from './due'
import {
  blankVisit,
  canAddPrescription,
  heldNote,
  readVisit,
  recentChecks,
  visitDraftFrom,
  visitLocked,
  visitSummary,
  warnsHeldIsFinal,
} from './visits'

const NOW = new Date(2026, 8, 24, 12, 0)
const TODAY = '2026-09-24'

function visit(overrides: Partial<HealthEvent>): HealthEvent {
  return {
    id: 'v', kind: 'visit', status: 'done', date: '2026-08-02', clinic: 'Айболит', notes: null, items: [],
    visit_kind: 'illness', reason: 'Рвота два дня', diagnosis: 'Обострение гастрита', check_id: null, ...overrides,
  }
}

describe('the visit form', () => {
  it('builds a done visit with prescriptions, each to the medicines unless unchecked (MR-07.1)', () => {
    const draft = {
      ...blankVisit('done', NOW),
      visitKind: 'illness' as const,
      reason: 'Рвота',
      diagnosis: 'Гастрит',
      prescriptions: [
        { key: 'a', name: 'Фортифлора', instructions: '1 пакетик', toMedicines: true },
        { key: 'b', name: 'Смекта', instructions: '', toMedicines: false },
      ],
    }
    const read = readVisit(ru, draft, 'new', NOW)
    expect(read.ok && read.value).toEqual({
      status: 'done',
      date: '2026-09-24',
      visit_kind: 'illness',
      clinic: null,
      notes: null,
      reason: 'Рвота',
      diagnosis: 'Гастрит',
      check_id: null,
      prescriptions: [
        { name: 'Фортифлора', instructions: '1 пакетик', add_to_medications: true },
        { name: 'Смекта', instructions: null, add_to_medications: false },
      ],
    })
  })

  it('sends no diagnosis or prescriptions for a plan (MR-07.3)', () => {
    const draft = { ...blankVisit('planned', NOW), date: '03.10.2026', diagnosis: 'x', prescriptions: [{ key: 'a', name: 'y', instructions: '', toMedicines: true }] }
    const read = readVisit(ru, draft, 'new', NOW)
    expect(read.ok && read.value).toMatchObject({ status: 'planned', diagnosis: null, prescriptions: [] })
  })

  it('refuses a done visit tomorrow and a nameless prescription', () => {
    expect(readVisit(ru, { ...blankVisit('done', NOW), date: '25.09.2026' }, 'new', NOW).ok).toBe(false)
    const read = readVisit(ru, { ...blankVisit('done', NOW), prescriptions: [{ key: 'a', name: ' ', instructions: '', toMedicines: true }] }, 'new', NOW)
    expect(!read.ok && read.errors.prescriptions).toEqual({ a: 'Введите название' })
  })

  it('refuses a prescription name or instructions longer than the record keeps', () => {
    const long = (name: string, instructions: string) =>
      readVisit(ru, { ...blankVisit('done', NOW), prescriptions: [{ key: 'a', name, instructions, toMedicines: true }] }, 'new', NOW)
    const name = long('Ф'.repeat(VISIT_LIMITS.prescriptionName + 1), '')
    expect(name.ok ? null : name.errors.prescriptions).toEqual({ a: 'Не длиннее 100 символов' })
    // Each said at its own field.
    const both = long('Ф'.repeat(VISIT_LIMITS.prescriptionName + 1), 'x'.repeat(VISIT_LIMITS.instructions + 1))
    expect(both.ok ? null : both.errors).toEqual({ prescriptions: { a: 'Не длиннее 100 символов' }, instructions: { a: 'Не длиннее 150 символов' } })
    expect(long('Ф'.repeat(VISIT_LIMITS.prescriptionName), 'x'.repeat(VISIT_LIMITS.instructions)).ok).toBe(true)
  })

  it('refuses a clinic, reason, diagnosis or note longer than the contract keeps, before sending', () => {
    const over = (field: 'clinic' | 'reason' | 'diagnosis' | 'notes') => 'а'.repeat(VISIT_LIMITS[field] + 1)
    const read = readVisit(
      ru,
      { ...blankVisit('done', NOW), clinic: over('clinic'), reason: over('reason'), diagnosis: over('diagnosis'), notes: over('notes') },
      'new',
      NOW,
    )
    expect(read.ok ? null : read.errors).toEqual({
      clinic: `Не длиннее ${VISIT_LIMITS.clinic} символов`,
      reason: `Не длиннее ${VISIT_LIMITS.reason} символов`,
      diagnosis: `Не длиннее ${VISIT_LIMITS.diagnosis} символов`,
      notes: `Не длиннее ${VISIT_LIMITS.notes} символов`,
    })
    const atLimit = (field: 'clinic' | 'reason' | 'diagnosis' | 'notes') => 'а'.repeat(VISIT_LIMITS[field])
    expect(
      readVisit(
        ru,
        { ...blankVisit('done', NOW), clinic: atLimit('clinic'), reason: atLimit('reason'), diagnosis: atLimit('diagnosis'), notes: atLimit('notes') },
        'new',
        NOW,
      ).ok,
    ).toBe(true)
    // A plan sends no diagnosis: whatever the hidden field holds is not read.
    const plan = { ...blankVisit('planned', NOW), date: '03.10.2026', diagnosis: over('diagnosis') }
    expect(readVisit(ru, plan, 'new', NOW).ok).toBe(true)
  })

  it('adds prescriptions up to what a visit keeps', () => {
    const many = (n: number) => ({
      prescriptions: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, name: 'x', instructions: '', toMedicines: true })),
    })
    expect(canAddPrescription(many(VISIT_LIMITS.prescriptions - 1))).toBe(true)
    expect(canAddPrescription(many(VISIT_LIMITS.prescriptions))).toBe(false)
  })

  it('offers the checks of the last 30 days by the phone’s day', () => {
    // By the phone's own day, whatever its zone: 00:30 on 25 August is in, 23:30 on the 24th is out.
    const checks = [
      { id: 'in', created_at: new Date(2026, 7, 25, 12, 0).toISOString() },
      { id: 'edge', created_at: new Date(2026, 7, 25, 0, 30).toISOString() },
      { id: 'out', created_at: new Date(2026, 7, 24, 23, 30).toISOString() },
    ]
    expect(recentChecks(checks, NOW).map((check) => check.id)).toEqual(['in', 'edge'])
  })

  it('keeps the check a visit is already linked to, however old', () => {
    const checks = [{ id: 'old', created_at: new Date(2026, 6, 1, 12, 0).toISOString() }]
    expect(recentChecks(checks, NOW)).toEqual([])
    expect(recentChecks(checks, NOW, 'old').map((check) => check.id)).toEqual(['old'])
  })

  it('lets an overdue plan keep its own day when changed, but not move to another past day (shared rule)', () => {
    const plan = visitDraftFrom(visit({ status: 'planned', date: '2026-09-20', diagnosis: null }))
    expect(readVisit(ru, plan, 'edit', NOW, '2026-09-20').ok).toBe(true)
    expect(readVisit(ru, { ...plan, date: '21.09.2026' }, 'edit', NOW, '2026-09-20').ok).toBe(false)
    expect(readVisit(ru, { ...plan, date: '20.09.2026' }, 'new', NOW).ok).toBe(false)
  })

  it('opens only a plan; a visit that happened is read-only (owner rule 26.09)', () => {
    expect(visitLocked(visit({ status: 'done' }))).toBe(true)
    expect(visitLocked(visit({ status: 'planned' }))).toBe(false)
  })

  it('warns that a visit that happened cannot be changed: a new «Был» and «Был» on a plan', () => {
    expect(warnsHeldIsFinal('new', 'done')).toBe(true)
    expect(warnsHeldIsFinal('done', 'done')).toBe(true)
    expect(warnsHeldIsFinal('new', 'planned')).toBe(false)
    expect(warnsHeldIsFinal('edit', 'planned')).toBe(false)
  })

  it('keeps prescription ids when editing, and does not re-add existing ones to the medicines', () => {
    const draft = visitDraftFrom(visit({ items: [{ id: 'i1', name: 'Фортифлора', targets: [], source_item_id: null, product_id: null, interval: null, instructions: '1 пакетик', medication_id: 'm1' }] }))
    const read = readVisit(ru, draft, 'edit', NOW, '2026-08-02')
    expect(read.ok && read.value.prescriptions).toEqual([{ id: 'i1', name: 'Фортифлора', instructions: '1 пакетик' }])
  })

  it('opens «Был» on a plan as done with the plan’s fields: today for a plan still ahead, its own day once it has come', () => {
    const draft = visitDraftFrom(visit({ status: 'planned', date: '2026-10-03', diagnosis: null }), 'done', NOW)
    expect(draft).toMatchObject({ status: 'done', date: '24.09.2026', visitKind: 'illness', clinic: 'Айболит' })
    const overdue = visitDraftFrom(visit({ status: 'planned', date: '2026-09-20', diagnosis: null }), 'done', NOW)
    expect(overdue.date).toBe('20.09.2026')
  })
})

describe('visits elsewhere', () => {
  it('is one due row for a planned visit, titled as a visit', () => {
    const due = dueItems([visit({ status: 'planned', date: '2026-10-03', diagnosis: null })])
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ kind: 'visit', eventId: 'v', itemId: 'v' })
    expect(itemTitle(ru, due[0].item, 'visit')).toBe('Визит к врачу')
  })

  it('sums the section up with the last visit and its diagnosis', () => {
    expect(visitSummary(ru, [visit({})], TODAY)).toBe('Последний — 2 августа, Обострение гастрита')
    expect(visitSummary(ru, [visit({ diagnosis: null, reason: null })], TODAY)).toBe('Последний — 2 августа, Болезнь')
    expect(visitSummary(ru, [], TODAY)).toBeNull()
  })
})

describe('a visit that happened, as viewed', () => {
  const prescription = (medication_id: string | null) => ({
    id: `p-${medication_id ?? 'none'}`, name: 'Фортифлора', targets: [], source_item_id: null, product_id: null,
    interval: null, instructions: null, medication_id,
  })

  it('offers the medicines only while a prescription is not there yet', () => {
    expect(heldNote(ru, visit({ items: [prescription(null), prescription('m1')] }))).toBe(ru.medicalRecord.visits.heldReadOnlyAdd)
    expect(heldNote(ru, visit({ items: [prescription('m1')] }))).toBe(ru.medicalRecord.visits.heldReadOnly)
    expect(heldNote(ru, visit({ items: [] }))).toBe(ru.medicalRecord.visits.heldReadOnly)
    expect(ru.medicalRecord.visits.heldReadOnly).not.toMatch(/лекарств/)
  })

  it('says nothing of the kind for a plan', () => {
    expect(heldNote(ru, visit({ status: 'planned', items: [prescription(null)] }))).toBeNull()
  })
})
