import { describe, expect, it } from 'vitest'
import { HEALTH_EVENT_LIMITS, type HealthEvent } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { saveSummary } from './due'
import { blankDraft, blankItem, canAddItem, completionRequest, draftFromEvent, draftChanged, eventPatch, formStart, formSummary, nextChoices, nextDate, pickProduct, plannedItem, readDraft, renameItem, toggleGroup, toggleTarget, warnsDoneIsFinal, type EventDraft, type ItemDraft } from './event-form'

const NOW = new Date(2026, 8, 24, 12, 0) // 24 Sept 2026, local

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    kind: 'vaccination',
    status: 'done',
    date: '24.09.2026',
    items: [{ ...blankItem('a'), name: 'Нобивак Rabies', targets: ['rabies'] }],
    clinic: '',
    notes: '',
    ...overrides,
  }
}

describe('reading the vaccination form', () => {
  it('refuses a visit, which has its own form, instead of saving it as a vaccination', () => {
    expect(() => readDraft(ru, draft({ kind: 'visit' }), 'new', NOW)).toThrow()
  })

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

describe('the lengths the contract keeps, before anything is sent (MW-09)', () => {
  const over = (n: number) => 'к'.repeat(n + 1)

  it('refuses a clinic and a note over the limit, under their fields, with the contract’s numbers', () => {
    const read = readDraft(ru, draft({ clinic: over(HEALTH_EVENT_LIMITS.clinic), notes: over(HEALTH_EVENT_LIMITS.notes) }), 'new', NOW)
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.errors.clinic).toBe(ru.medicalRecord.tooLong(HEALTH_EVENT_LIMITS.clinic))
    expect(read.errors.notes).toBe(ru.medicalRecord.tooLong(HEALTH_EVENT_LIMITS.notes))
  })

  it('takes them at the limit', () => {
    const at = 'к'.repeat(HEALTH_EVENT_LIMITS.clinic)
    expect(readDraft(ru, draft({ clinic: at, notes: 'н'.repeat(HEALTH_EVENT_LIMITS.notes) }), 'new', NOW).ok).toBe(true)
  })

  it('refuses an item name over the limit, under that item', () => {
    const long: ItemDraft = { ...blankItem('long'), name: over(HEALTH_EVENT_LIMITS.itemName), targets: ['rabies'], source: 'manual' }
    const read = readDraft(ru, draft({ items: [{ ...blankItem('a'), name: 'Нобивак', targets: ['rabies'] }, long] }), 'new', NOW)
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.errors.items).toEqual({ long: ru.medicalRecord.tooLong(HEALTH_EVENT_LIMITS.itemName) })
  })

  it('offers one more item only while the record has room, and refuses more than it keeps', () => {
    const items = (n: number): ItemDraft[] => Array.from({ length: n }, (_, i) => ({ ...blankItem(`i${i}`), name: 'Нобивак', targets: ['rabies'] }))
    expect(canAddItem({ items: items(HEALTH_EVENT_LIMITS.items - 1) })).toBe(true)
    expect(canAddItem({ items: items(HEALTH_EVENT_LIMITS.items) })).toBe(false)
    const read = readDraft(ru, draft({ items: items(HEALTH_EVENT_LIMITS.items + 1) }), 'new', NOW)
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.errors.form).toBe(ru.medicalRecord.eventItemsFull(HEALTH_EVENT_LIMITS.items))
  })

  it('says «уже отмечено раньше» without sending the owner to look in the medical record — the button opens it', () => {
    for (const text of [ru.medicalRecord.earlierDone('24 сентября 2026'), ru.medicalRecord.earlierNext('24 сентября 2026')]) {
      expect(text).not.toMatch(/медкарт/)
    }
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
    items: [{ id: 'i1', name: 'Нобивак Rabies', targets: ['rabies'], source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null }],
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
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
    items: [{ id: 'i1', name: null, targets: ['rabies'], source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null }],
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
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
    name_en: null,
    manufacturer: 'MSD',
    aliases: [],
    species: ['cat' as const, 'dog' as const],
    form: 'injection',
    targets: ['rabies'],
    interval: { value: 12, unit: 'week' as const },
    popular: true,
  }
  const tricat = { ...rabies12w, id: '11111111-1111-4111-8111-0000000000b2', name: 'Нобивак Tricat Trio', name_en: 'Nobivac Tricat Trio', targets: ['panleukopenia', 'calicivirus'], interval: { value: 1, unit: 'year' as const } }

  it('fills name, diseases, product and interval, and the next date follows the interval', () => {
    const item = pickProduct({ ...blankItem('a'), next: 'none', targets: ['felv'] }, rabies12w, 'ru')
    expect(item).toMatchObject({ name: 'Нобивак Rabies', targets: ['rabies'], productId: rabies12w.id, source: 'catalog', next: 'year' })
    expect(nextDate(item, '2026-09-24', '2026-09-24')).toBe('2026-12-17')
  })

  it('replaces everything when another product is picked', () => {
    const item = pickProduct(pickProduct(blankItem('a'), rabies12w, 'ru'), tricat, 'ru')
    expect(item).toMatchObject({ name: 'Нобивак Tricat Trio', targets: ['panleukopenia', 'calicivirus'], productId: tricat.id })
    expect(nextDate(item, '2026-09-24', '2026-09-24')).toBe('2027-09-24')
  })

  it('writes the name the reader was shown', () => {
    // Was «Нобивак Tricat Trio» in an English record.
    expect(pickProduct(blankItem('a'), tricat, 'en').name).toBe('Nobivac Tricat Trio')
    // No English name: the Russian one, in either language.
    expect(pickProduct(blankItem('a'), rabies12w, 'en').name).toBe('Нобивак Rabies')
  })

  it('lets go of a picked vaccine when what it is against changes, keeping the chips', () => {
    const picked = pickProduct(blankItem('a'), tricat, 'ru')
    const fewer = toggleTarget(picked, 'calicivirus')
    expect(fewer).toMatchObject({ name: '', productId: null, interval: null, source: 'unset', targets: ['panleukopenia'] })
    const more = toggleTarget(picked, 'rabies')
    expect(more).toMatchObject({ name: '', productId: null, targets: ['panleukopenia', 'calicivirus', 'rabies'] })
  })

  it('keeps a name typed by hand whatever the chips say', () => {
    const typed = renameItem(blankItem('a'), 'Вакцина из клиники')
    expect(toggleTarget(typed, 'rabies')).toMatchObject({ name: 'Вакцина из клиники', source: 'manual', targets: ['rabies'] })
  })

  it('lets go of a picked treatment when a parasite group changes', () => {
    const bravecto = { ...rabies12w, kind: 'antiparasitic' as const, name: 'Бравекто', targets: ['fleas', 'ticks'] }
    const picked = pickProduct({ ...blankItem('b', 'parasite') }, bravecto, 'ru')
    expect(toggleGroup(picked, 'worms')).toMatchObject({ name: '', productId: null, source: 'unset', targets: ['fleas', 'ticks', 'worms'] })
  })

  it('stops pointing at the product once its name is changed by hand, keeping what was typed', () => {
    const item = renameItem(pickProduct(blankItem('a'), rabies12w, 'ru'), 'Нобивак Rabies (другая серия)')
    expect(item).toMatchObject({ name: 'Нобивак Rabies (другая серия)', targets: ['rabies'], productId: null, source: 'manual' })
  })

  it('sends the product with the item', () => {
    const read = readDraft(ru, draft({ items: [pickProduct(blankItem('a'), tricat, 'ru')] }), 'new', NOW)
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
      items: [{ id: 'i', name: 'Бравекто', targets: ['rabies'], source_item_id: null, product_id: 'x', interval: { value: 12, unit: 'week' }, instructions: null, medication_id: null }],
      visit_kind: null,
      reason: null,
      diagnosis: null,
      check_id: null,
    }
    const item = draftFromEvent(plan).items[0]
    expect(nextDate(item, '2026-10-01', '2026-10-01')).toBe('2026-12-24')
  })
})

describe('what a save planned, for the reminder question', () => {
  const item = { name: 'Нобивак Rabies', targets: ['rabies' as const] }

  it('is the first item of a plan, or the first with a next date', () => {
    expect(plannedItem({ kind: 'vaccination', status: 'planned', items: [{ ...item, next_on: null }] })).toEqual({
      kind: 'vaccination',
      name: 'Нобивак Rabies',
      targets: ['rabies'],
    })
    const done = { kind: 'parasite' as const, status: 'done' as const }
    expect(plannedItem({ ...done, items: [{ ...item, next_on: null }, { name: 'Мильбемакс', targets: ['worms' as const], next_on: '2026-12-24' }] })).toEqual({
      kind: 'parasite',
      name: 'Мильбемакс',
      targets: ['worms'],
    })
  })

  it('is nothing for a done record without next dates', () => {
    expect(plannedItem({ kind: 'vaccination', status: 'done', items: [{ ...item, next_on: null }] })).toBeNull()
  })
})

describe('the done-is-final warning (MW-03 fix round 1)', () => {
  it('warns before the first save of something done: a new done record and «Сделано» on a plan', () => {
    expect(warnsDoneIsFinal('new', 'done')).toBe(true)
    expect(warnsDoneIsFinal('complete', 'done')).toBe(true)
    expect(warnsDoneIsFinal('new', 'planned')).toBe(false)
    expect(warnsDoneIsFinal('edit', 'planned')).toBe(false)
  })
})

describe('day rules shared with the site (MW-03 fix round 1)', () => {
  it('refuses a done day after today, a plan day before it, and a day that does not exist', () => {
    expect(readDraft(ru, draft({ date: '25.09.2026' }), 'new', NOW).ok).toBe(false)
    expect(readDraft(ru, draft({ status: 'planned', date: '23.09.2026' }), 'new', NOW).ok).toBe(false)
    expect(readDraft(ru, draft({ date: '30.02.2026' }), 'new', NOW).ok).toBe(false)
    expect(readDraft(ru, draft({ status: 'planned', date: '24.09.2026' }), 'new', NOW).ok).toBe(true)
  })

  it('takes a custom next date only after the record and not in the past', () => {
    const custom = (nextText: string) => ({ ...blankItem('a'), name: 'x', targets: ['rabies' as const], next: 'custom' as const, nextText })
    expect(nextDate(custom('25.09.2027'), '2026-09-24', '2026-09-24')).toBe('2027-09-25')
    expect(nextDate(custom('24.09.2026'), '2026-09-24', '2026-09-24')).toBeUndefined()
    expect(nextDate(custom('20.09.2026'), '2026-09-10', '2026-09-24')).toBeUndefined()
  })
})

describe('opening the record form', () => {
  const planned = (overrides: Partial<HealthEvent> = {}): HealthEvent => ({
    id: 'e1',
    kind: 'vaccination',
    status: 'planned',
    date: '2026-10-01',
    clinic: 'Айболит',
    notes: 'натощак',
    items: [
      { id: 'i1', name: 'Нобивак Rabies', targets: ['rabies'], source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null },
      { id: 'i2', name: null, targets: ['panleukopenia'], source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null },
    ],
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
    ...overrides,
  })

  it('starts a new record of the kind the address says, with one empty item', () => {
    expect(formStart([], { mode: 'new', kind: 'parasite', status: 'planned' }, NOW)).toEqual({
      state: 'open',
      kind: 'parasite',
      draft: { ...blankDraft('planned', NOW, 'parasite'), items: [blankItem('new-0', 'parasite')] },
    })
  })

  it('starts a new record as done today, and as a vaccination when no kind is said', () => {
    const start = formStart([], { mode: 'new', kind: null }, NOW)
    expect(start).toMatchObject({ state: 'open', kind: 'vaccination', draft: { status: 'done', date: '24.09.2026' } })
  })

  it('opens a plan to correct with its own day kept', () => {
    const event = planned({ kind: 'parasite' })
    expect(formStart([event], { mode: 'edit', kind: null, eventId: 'e1' }, NOW)).toEqual({
      state: 'open',
      kind: 'parasite',
      draft: draftFromEvent(event),
      keptDate: '2026-10-01',
    })
  })

  it('locks a record that was done, named after its own kind', () => {
    expect(formStart([planned({ status: 'done', kind: 'parasite' })], { mode: 'edit', kind: 'vaccination', eventId: 'e1' }, NOW)).toEqual({
      state: 'locked',
      kind: 'parasite',
    })
  })

  it('marks one planned item done today, with the plan’s clinic and note and the rest counted', () => {
    const event = planned()
    const start = formStart([event], { mode: 'complete', kind: null, itemId: 'i2' }, NOW)
    expect(start).toEqual({
      state: 'open',
      kind: 'vaccination',
      draft: {
        kind: 'vaccination',
        status: 'done',
        date: '24.09.2026',
        items: [{ ...draftFromEvent({ ...event, items: [event.items[1]] }).items[0], next: 'year' }],
        clinic: 'Айболит',
        notes: 'натощак',
      },
      source: { event, others: 1 },
    })
  })

  it('finds nothing for a record or an item that is not there', () => {
    expect(formStart([planned()], { mode: 'edit', kind: null, eventId: 'gone' }, NOW)).toBeNull()
    expect(formStart([planned()], { mode: 'complete', kind: null, itemId: 'gone' }, NOW)).toBeNull()
  })
})

describe('what a save sends', () => {
  const value = {
    kind: 'vaccination' as const,
    status: 'done' as const,
    date: '2026-09-24',
    clinic: null,
    notes: null,
    items: [{ id: 'i1', name: 'Нобивак Rabies', targets: ['rabies' as const], product_id: null, next_on: '2027-09-24' }],
  }

  it('sends «Сделано» with the plan’s texts cleared when the fields were emptied', () => {
    expect(completionRequest(value, 'i1')).toEqual({
      itemId: 'i1',
      input: { done_on: '2026-09-24', next_on: '2027-09-24', clinic: '', notes: '' },
    })
    expect(completionRequest({ ...value, items: [], clinic: 'Айболит', notes: 'x' }, 'i1').input).toEqual({
      done_on: '2026-09-24',
      next_on: null,
      clinic: 'Айболит',
      notes: 'x',
    })
  })

  it('sends a correction without next dates, and its day only when it moved', () => {
    expect(eventPatch(value, '2026-09-24')).toEqual({
      clinic: null,
      notes: null,
      items: [{ id: 'i1', name: 'Нобивак Rabies', targets: ['rabies'], product_id: null }],
    })
    expect(eventPatch({ ...value, items: [{ ...value.items[0], id: undefined }] }, '2026-09-20')).toEqual({
      date: '2026-09-24',
      clinic: null,
      notes: null,
      items: [{ name: 'Нобивак Rabies', targets: ['rabies'], product_id: null }],
    })
  })
})

describe('the next-date choices', () => {
  const item: ItemDraft = { ...blankItem('a'), name: 'Нобивак Rabies', targets: ['rabies'] }
  const words = ru.medicalRecord
  const spoken = words.catalog.interval.year(1)

  it('names the suggested day a year on, or a dash before the record has a day', () => {
    expect(nextChoices(ru, item, '2026-09-24', '2026-09-24')).toEqual([
      { value: 'year', label: words.catalog.nextIn(spoken, ru.day('2027-09-24', true)) },
      { value: 'custom', label: words.nextCustom },
      { value: 'none', label: words.nextNone },
    ])
    expect(nextChoices(ru, item, null, '2026-09-24')[0].label).toBe(words.catalog.nextIn(spoken, '—'))
  })

  it('says the suggested day has passed for an old record', () => {
    expect(nextChoices(ru, item, '2024-09-01', '2026-09-24')[0].label).toBe(words.nextPassed)
  })
})

describe('the note above «Сохранить»', () => {
  const done = draft()

  it('says what a done record plans next', () => {
    expect(formSummary(ru, { draft: done, mode: 'new', recordDay: '2026-09-24', others: 0 }, '2026-09-24')).toBe(
      saveSummary(ru, ['2027-09-24'], '2026-09-24'),
    )
  })

  it('adds what becomes of the rest of the plan when one item is marked, and only then', () => {
    const base = saveSummary(ru, ['2027-09-24'], '2026-09-24')
    expect(formSummary(ru, { draft: done, mode: 'complete', recordDay: '2026-09-24', others: 2 }, '2026-09-24')).toBe(
      `${base} ${ru.medicalRecord.summaryComplete(2)}`,
    )
    expect(formSummary(ru, { draft: done, mode: 'new', recordDay: '2026-09-24', others: 2 }, '2026-09-24')).toBe(base)
  })

  it('says nothing for a plan, a correction, or a day not yet typed', () => {
    expect(formSummary(ru, { draft: draft({ status: 'planned' }), mode: 'new', recordDay: null, others: 0 }, '2026-09-24')).toBeNull()
    expect(formSummary(ru, { draft: done, mode: 'edit', recordDay: '2026-09-24', others: 0 }, '2026-09-24')).toBeNull()
    expect(formSummary(ru, { draft: done, mode: 'new', recordDay: null, others: 0 }, '2026-09-24')).toBeNull()
  })
})
