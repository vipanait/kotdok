import { describe, expect, it } from 'vitest'
import type { HealthEvent } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { dueItems, itemTitle } from './due'
import { blankVisit, readVisit, visitDraftFrom, visitSummary } from './visits'

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

  it('keeps prescription ids when editing, and does not re-add existing ones to the medicines', () => {
    const draft = visitDraftFrom(visit({ items: [{ id: 'i1', name: 'Фортифлора', targets: [], source_item_id: null, product_id: null, interval: null, instructions: '1 пакетик', medication_id: 'm1' }] }))
    const read = readVisit(ru, draft, 'edit', NOW, '2026-08-02')
    expect(read.ok && read.value.prescriptions).toEqual([{ id: 'i1', name: 'Фортифлора', instructions: '1 пакетик' }])
  })

  it('opens «Был» on a plan as done today with the plan’s fields', () => {
    const draft = visitDraftFrom(visit({ status: 'planned', date: '2026-10-03', diagnosis: null }), 'done', NOW)
    expect(draft).toMatchObject({ status: 'done', date: '24.09.2026', visitKind: 'illness', clinic: 'Айболит' })
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
