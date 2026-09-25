import { describe, expect, it } from 'vitest'
import type { HealthEvent } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { blankItem, draftFromEvent, draftChanged, nextDate, pickProduct, readDraft, renameItem, type EventDraft } from './event-form'

const NOW = new Date(2026, 8, 24, 12, 0) // 24 Sept 2026, local

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    status: 'done',
    date: '24.09.2026',
    items: [{ ...blankItem('a'), name: 'Нобивак Rabies', targets: ['rabies'] }],
    clinic: '',
    notes: '',
    ...overrides,
  }
}

describe('reading the vaccination form', () => {
  it('builds a done record with each vaccine’s next date a year on by default', () => {
    const read = readDraft(ru, draft({ items: [
      { ...blankItem('a'), name: 'Нобивак Tricat Trio', targets: ['panleukopenia'] },
      { ...blankItem('b'), name: 'Нобивак Rabies', targets: ['rabies'] },
    ] }), 'new', NOW)
    expect(read.ok && read.value).toEqual({
      kind: 'vaccination',
      status: 'done',
      date: '2026-09-24',
      clinic: null,
      notes: null,
      items: [
        { name: 'Нобивак Tricat Trio', targets: ['panleukopenia'], product_id: null, next_on: '2027-09-24' },
        { name: 'Нобивак Rabies', targets: ['rabies'], product_id: null, next_on: '2027-09-24' },
      ],
    })
  })

  it('takes a custom next date or none', () => {
    const read = readDraft(ru, draft({ items: [
      { ...blankItem('a'), targets: ['rabies'], next: 'custom', nextText: '01.03.2027' },
      { ...blankItem('b'), targets: ['felv'], next: 'none' },
    ] }), 'new', NOW)
    expect(read.ok && read.value.items.map((i) => i.next_on)).toEqual(['2027-03-01', null])
  })

  it('refuses a done record in the future and a plan in the past (MR-03.3)', () => {
    const future = readDraft(ru, draft({ date: '25.09.2026' }), 'new', NOW)
    expect(future.ok).toBe(false)
    expect(!future.ok && future.errors.date).toBe('Дата — ДД.ММ.ГГГГ, не позже сегодняшней')

    const past = readDraft(ru, draft({ status: 'planned', date: '23.09.2026' }), 'new', NOW)
    expect(!past.ok && past.errors.date).toBe('Дата — ДД.ММ.ГГГГ, сегодня или позже')
    expect(readDraft(ru, draft({ status: 'planned', date: '24.09.2026' }), 'new', NOW).ok).toBe(true)
  })

  it('sends no next dates for a plan', () => {
    const read = readDraft(ru, draft({ status: 'planned', date: '01.10.2026' }), 'new', NOW)
    expect(read.ok && read.value.items[0]).toEqual({ name: 'Нобивак Rabies', targets: ['rabies'], product_id: null, next_on: null })
  })

  it('asks for a name or a disease on every vaccine, and for at least one vaccine', () => {
    const empty = readDraft(ru, draft({ items: [blankItem('a')] }), 'new', NOW)
    expect(!empty.ok && empty.errors.items).toEqual({ a: 'Укажите название или отметьте, от чего прививка' })
    const none = readDraft(ru, draft({ items: [] }), 'new', NOW)
    expect(!none.ok && none.errors.form).toBe('Добавьте хотя бы одну вакцину')
  })

  it('refuses a custom next date that is not after the record', () => {
    const read = readDraft(ru, draft({ items: [{ ...blankItem('a'), targets: ['rabies'], next: 'custom', nextText: '24.09.2026' }] }), 'new', NOW)
    expect(!read.ok && read.errors.next).toEqual({ a: 'Следующая — ДД.ММ.ГГГГ, позже даты записи' })
  })
})

describe('editing a record', () => {
  const event: HealthEvent = {
    id: 'e',
    kind: 'vaccination',
    status: 'done',
    date: '2026-03-12',
    clinic: 'Айболит',
    notes: null,
    items: [{ id: 'i1', name: 'Нобивак Rabies', targets: ['rabies'], source_item_id: null, product_id: null, interval: null }],
  }

  it('opens with what the record holds and sees no change until there is one', () => {
    const opened = draftFromEvent(event)
    expect(opened).toMatchObject({ status: 'done', date: '12.03.2026', clinic: 'Айболит' })
    expect(draftChanged(opened, opened)).toBe(false)
    expect(draftChanged(opened, { ...opened, clinic: 'Вет' })).toBe(true)
  })

  it('keeps item ids so the server updates rather than replaces them', () => {
    const read = readDraft(ru, draftFromEvent(event), 'edit', NOW)
    expect(read.ok && read.value.items).toEqual([{ id: 'i1', name: 'Нобивак Rabies', targets: ['rabies'], product_id: null, next_on: null }])
  })
})

describe('an overdue plan (MR-03.3)', () => {
  const overdue: HealthEvent = {
    id: 'p',
    kind: 'vaccination',
    status: 'planned',
    date: '2026-09-12',
    clinic: null,
    notes: null,
    items: [{ id: 'i1', name: null, targets: ['rabies'], source_item_id: null, product_id: null, interval: null }],
  }

  it('can be corrected without moving it, and moved only forward', () => {
    const opened = draftFromEvent(overdue)
    expect(readDraft(ru, { ...opened, clinic: 'Айболит' }, 'edit', NOW, overdue.date).ok).toBe(true)
    expect(readDraft(ru, { ...opened, date: '20.09.2026' }, 'edit', NOW, overdue.date).ok).toBe(false)
    expect(readDraft(ru, { ...opened, date: '01.10.2026' }, 'edit', NOW, overdue.date).ok).toBe(true)
  })
})

describe('backfilling old vaccinations (review 2)', () => {
  it('plans nothing when a year on has already passed, and says so', () => {
    const read = readDraft(ru, draft({ date: '12.03.2024' }), 'new', NOW)
    expect(read.ok && read.value.items[0].next_on).toBeNull()
    expect(nextDate(blankItem('x'), '2024-03-12', '2026-09-24')).toBeNull()
    expect(nextDate(blankItem('x'), '2026-03-12', '2026-09-24')).toBe('2027-03-12')
  })

  it('refuses a custom next date that has passed', () => {
    const read = readDraft(ru, draft({ date: '12.03.2024', items: [{ ...blankItem('a'), targets: ['rabies'], next: 'custom', nextText: '12.03.2025' }] }), 'new', NOW)
    expect(!read.ok && read.errors.next).toEqual({ a: 'Следующая — ДД.ММ.ГГГГ, позже даты записи' })
  })
})

describe('picking from the catalogue (MR-04.3)', () => {
  const rabies12w = {
    id: '11111111-1111-4111-8111-0000000000b1',
    kind: 'vaccine' as const,
    name: 'Нобивак Rabies',
    manufacturer: 'MSD',
    aliases: [],
    species: ['cat' as const, 'dog' as const],
    form: 'injection',
    targets: ['rabies'],
    interval: { value: 12, unit: 'week' as const },
    popular: true,
  }
  const tricat = { ...rabies12w, id: '11111111-1111-4111-8111-0000000000b2', name: 'Нобивак Tricat Trio', targets: ['panleukopenia', 'calicivirus'], interval: { value: 1, unit: 'year' as const } }

  it('fills name, diseases, product and interval, and the next date follows the interval', () => {
    const item = pickProduct({ ...blankItem('a'), next: 'none', targets: ['felv'] }, rabies12w)
    expect(item).toMatchObject({ name: 'Нобивак Rabies', targets: ['rabies'], productId: rabies12w.id, source: 'catalog', next: 'year' })
    expect(nextDate(item, '2026-09-24', '2026-09-24')).toBe('2026-12-17')
  })

  it('replaces everything when another product is picked', () => {
    const item = pickProduct(pickProduct(blankItem('a'), rabies12w), tricat)
    expect(item).toMatchObject({ name: 'Нобивак Tricat Trio', targets: ['panleukopenia', 'calicivirus'], productId: tricat.id })
    expect(nextDate(item, '2026-09-24', '2026-09-24')).toBe('2027-09-24')
  })

  it('stops pointing at the product once its name is changed by hand, keeping what was typed', () => {
    const item = renameItem(pickProduct(blankItem('a'), rabies12w), 'Нобивак Rabies (другая серия)')
    expect(item).toMatchObject({ name: 'Нобивак Rabies (другая серия)', targets: ['rabies'], productId: null, source: 'manual' })
  })

  it('sends the product with the item', () => {
    const read = readDraft(ru, draft({ items: [pickProduct(blankItem('a'), tricat)] }), 'new', NOW)
    expect(read.ok && read.value.items[0]).toEqual({
      name: 'Нобивак Tricat Trio',
      targets: ['panleukopenia', 'calicivirus'],
      product_id: tricat.id,
      next_on: '2027-09-24',
    })
  })
})

describe('«Сделано» on a plan picked from the catalogue (review 2)', () => {
  it('suggests the next date by the interval the item was saved with', () => {
    const plan: HealthEvent = {
      id: 'p', kind: 'vaccination', status: 'planned', date: '2026-10-01', clinic: null, notes: null,
      items: [{ id: 'i', name: 'Бравекто', targets: ['rabies'], source_item_id: null, product_id: 'x', interval: { value: 12, unit: 'week' } }],
    }
    const item = draftFromEvent(plan).items[0]
    expect(nextDate(item, '2026-10-01', '2026-10-01')).toBe('2026-12-24')
  })
})
