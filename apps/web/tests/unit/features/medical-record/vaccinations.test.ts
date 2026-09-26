import { describe, expect, it } from 'vitest'
import type { HealthEvent, HealthOverview, HealthProduct } from '@lapka/contracts'
import { ApiError, ApiTimeoutError } from '@lapka/shared'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { createSaveKey } from '@/features/forms/save-key'
import { catalogOptions, POPULAR_SHOWN, productDetail } from '@/features/medical-record/events/catalog-view'
import {
  blankEventDraft,
  changeDate,
  draftChanged,
  draftFromPlan,
  eventSaveFailure,
  manualItem,
  noProductItem,
  productItem,
  readNewEvent,
  readPlanChange,
  switchStatus,
  toggleTarget,
} from '@/features/medical-record/events/event-form'
import { eventErrorTexts, eventFailureText } from '@/features/medical-record/events/event-form-text'
import { eventRecord, eventsPage, parseEventSaved } from '@/features/medical-record/events/event-view'
import { DESIGN_TODAY, bobik, murka } from './demo-overviews'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TODAY = DESIGN_TODAY

function product(n: number, fields: Partial<HealthProduct> = {}): HealthProduct {
  return {
    id: id(900 + n),
    kind: 'vaccine',
    name: `Препарат ${n}`,
    manufacturer: 'MSD',
    aliases: [],
    species: ['cat'],
    form: 'injection',
    targets: ['rabies'],
    interval: { value: 1, unit: 'year' },
    popular: false,
    ...fields,
  }
}

const plan = murka.events.find((event) => event.kind === 'vaccination' && event.status === 'planned') as HealthEvent
const done = murka.events.find((event) => event.kind === 'vaccination' && event.status === 'done') as HealthEvent

describe('the form: «Сделано» and «Запланировать» (MW-03)', () => {
  it('starts a done record today and a plan with no day; switching keeps the items', () => {
    const draft = blankEventDraft('vaccination', 'done', TODAY)
    expect(draft.date).toBe(TODAY)
    const withItem = { ...draft, items: [productItem('a', product(1), draft, TODAY)] }
    const planned = switchStatus(withItem, 'planned', TODAY)
    expect(planned.date).toBe('')
    expect(planned.items.map((item) => item.name)).toEqual(['Препарат 1'])
    expect(planned.items[0].next).toBe('')
    expect(switchStatus(planned, 'done', TODAY).items[0].next).toBe('2027-09-24')
  })

  it('suggests the next date from the catalogue interval only, follows the day, and keeps the owner’s own choice', () => {
    const draft = blankEventDraft('vaccination', 'done', TODAY)
    const picked = productItem('a', product(1, { interval: { value: 12, unit: 'week' } }), draft, TODAY)
    expect(picked.next).toBe('2026-12-17')
    const own = manualItem('b', 'Своя вакцина')
    expect(own.next).toBe('')
    const moved = changeDate({ ...draft, items: [picked, { ...manualItem('c', 'x'), next: '2027-01-01', nextTouched: true }] }, '2026-09-20', TODAY)
    expect(moved.items.map((item) => item.next)).toEqual(['2026-12-13', '2027-01-01'])
  })

  it('keeps only the pet’s kind of diseases from a product', () => {
    const draft = blankEventDraft('vaccination', 'done', TODAY)
    expect(productItem('a', product(1, { targets: ['rabies', 'fleas'] }), draft, TODAY).targets).toEqual(['rabies'])
  })
})

describe('the form: reading it (MW-03.1, MW-03.3)', () => {
  it('builds the contract body of two vaccines, the next date only on a done record', () => {
    const draft = blankEventDraft('vaccination', 'done', TODAY)
    const read = readNewEvent(
      {
        ...draft,
        clinic: '  Айболит ',
        items: [productItem('a', product(1), draft, TODAY), toggleTarget(manualItem('b', 'Своя'), 'panleukopenia')],
      },
      TODAY,
    )
    expect(read).toEqual({
      ok: true,
      input: {
        kind: 'vaccination',
        status: 'done',
        date: TODAY,
        clinic: 'Айболит',
        notes: null,
        items: [
          { name: 'Препарат 1', targets: ['rabies'], product_id: id(901), next_on: '2027-09-24' },
          { name: 'Своя', targets: ['panleukopenia'], product_id: null, next_on: null },
        ],
      },
    })
  })

  it('refuses a no-product item without diseases, an empty own name, a missing day and bad next dates', () => {
    const draft = blankEventDraft('vaccination', 'done', TODAY)
    const read = readNewEvent(
      {
        ...draft,
        items: [
          noProductItem('none'),
          manualItem('own', '   '),
          { ...toggleTarget(manualItem('early', 'x'), 'rabies'), next: TODAY },
        ],
      },
      TODAY,
    )
    expect(read).toEqual({
      ok: false,
      problems: { item: { none: { targets: 'empty' }, own: { name: 'empty' }, early: { next: 'notAfter' } } },
    })
    expect(readNewEvent({ ...draft, date: '' }, TODAY)).toEqual({ ok: false, problems: { date: 'empty', items: 'none' } })
    expect(readNewEvent({ ...draft, date: '2026-09-25' }, TODAY)).toMatchObject({ ok: false, problems: { date: 'future' } })
    const plan = switchStatus(draft, 'planned', TODAY)
    expect(readNewEvent({ ...plan, date: '2026-09-23' }, TODAY)).toMatchObject({ ok: false, problems: { date: 'past' } })
  })

  it('says each problem in words, with the contract’s limits', () => {
    const texts = eventErrorTexts(ru, 'vaccination', { date: 'future', items: 'tooMany', clinic: 'tooLong', item: { a: { targets: 'empty', name: 'tooLong' } } })
    expect(texts.date).toBe('Сделанная процедура не может быть позже сегодняшнего дня')
    expect(texts.items).toBe('В одной записи — не больше 10 позиций')
    expect(texts.clinic).toBe('Клиника — не длиннее 100 символов')
    expect(texts.item.a).toEqual({ name: 'Название — не длиннее 100 символов', targets: 'Отметьте, от чего прививка', next: undefined })
    expect(eventErrorTexts(en, 'parasite', { item: { a: { targets: 'empty' } } }).item.a.targets).toBe('Mark what the treatment was against')
  })
})

describe('the form: correcting a plan (MW-03.1)', () => {
  it('sends only what changed, the items whole with their ids', () => {
    const draft = draftFromPlan(plan)
    expect(readPlanChange(plan, draft, TODAY)).toEqual({ ok: true, patch: null })
    expect(draftChanged(draft, draft)).toBe(false)

    const moved = readPlanChange(plan, { ...draft, date: '2027-04-01', notes: 'после осмотра' }, TODAY)
    expect(moved).toEqual({ ok: true, patch: { date: '2027-04-01', notes: 'после осмотра' } })

    const fewer = readPlanChange(plan, { ...draft, items: draft.items.slice(1) }, TODAY)
    expect(fewer).toEqual({ ok: true, patch: { items: [{ id: id(204), name: 'Нобивак Rabies', targets: ['rabies'], product_id: null }] } })
  })

  it('never corrects a done record', () => {
    expect(() => readPlanChange(done, draftFromPlan(done), TODAY)).toThrow()
  })
})

describe('a failed save (MW-03.4)', () => {
  it('tells an earlier save that landed from a refusal, a done plan and no connection', () => {
    expect(eventSaveFailure(new ApiError('conflict', 409, 'x'))).toBe('alreadySaved')
    expect(eventSaveFailure(new ApiError('record_done', 409, 'x'))).toBe('done')
    expect(eventSaveFailure(new ApiError('bad_request', 400, 'x'))).toBe('rejected')
    expect(eventSaveFailure(new TypeError('Failed to fetch'))).toBe('offline')
    expect(eventSaveFailure(new ApiTimeoutError('/x', 1))).toBe('offline')
    expect(eventFailureText(ru, 'offline')).toBe('Нет связи с сервером. Введённые данные сохранены в форме — попробуйте ещё раз.')
  })

  it('keeps one key for every retry of a save, and a new one after it succeeded', () => {
    let n = 0
    const key = createSaveKey(() => `key-${++n}`)
    expect([key.current(), key.current()]).toEqual(['key-1', 'key-1'])
    key.renew()
    expect(key.current()).toBe('key-2')
  })
})

describe('the catalogue list (MW-03.2)', () => {
  it('shows the popular products first on focus, at most eight, then the two ways out', () => {
    const products = Array.from({ length: 12 }, (_, n) => product(n, { popular: n % 2 === 1 }))
    const options = catalogOptions(products, '')
    expect(options).toHaveLength(POPULAR_SHOWN + 2)
    expect(options.slice(0, 6).every((option) => option.type === 'product' && option.product.popular)).toBe(true)
    expect(options.slice(-2).map((option) => option.type)).toEqual(['manual', 'none'])
  })

  it('offers the ways out when nothing is found or the catalogue failed', () => {
    expect(catalogOptions([], 'пурев').map((option) => option.type)).toEqual(['manual', 'none'])
  })

  it('labels a product with its maker, form and diseases', () => {
    expect(productDetail(ru, product(1, { targets: ['panleukopenia', 'calicivirus'] }))).toBe('MSD · Инъекция · панлейкопения, калицивироз')
  })
})

describe('the vaccinations page (MW-03)', () => {
  it('lists plans soonest first and done records newest first, each opening its own record', () => {
    const view = eventsPage(ru, 'ru', 'vaccination', murka, TODAY)
    expect(view.planned.map((card) => [card.day, card.items])).toEqual([['12 марта 2027', ['Нобивак Tricat Trio', 'Нобивак Rabies']]])
    expect(view.done.map((card) => [card.day, card.clinic, card.href])).toEqual([['12 марта 2026', 'Айболит', `/pets/${id(1)}/health/${id(101)}`]])
    expect(view.empty).toBeNull()
  })

  it('gives the core vaccinations of the pet’s own species', () => {
    expect(eventsPage(ru, 'ru', 'vaccination', murka, TODAY).core?.rows.map((row) => [row.title, row.text])).toEqual([
      ['Панлейкопения', 'Следующая — 12 марта 2027'],
      ['Калицивироз', 'Следующая — 12 марта 2027'],
      ['Ринотрахеит', 'Следующая — 12 марта 2027'],
      ['Бешенство', 'Следующая — 12 марта 2027'],
    ])
  })

  it('does not pass the form’s «привит» off as a dated vaccination', () => {
    const view = eventsPage(ru, 'ru', 'vaccination', bobik, TODAY)
    expect(view.empty).toEqual({
      title: 'Даты пока не записаны',
      body: 'В анкете отмечено: привит(а). Добавьте сделанные прививки или запланируйте следующие.',
    })
    expect(view.core?.rows.map((row) => [row.title, row.text])).toEqual([
      ['Чума плотоядных', 'Нет записей'],
      ['Парвовирусный энтерит', 'Нет записей'],
      ['Аденовироз', 'Нет записей'],
      ['Бешенство', 'Нет записей'],
    ])
    const unsaid: HealthOverview = { ...bobik, pet: { ...bobik.pet, vaccinated: null } }
    expect(eventsPage(ru, 'ru', 'vaccination', unsaid, TODAY).empty?.title).toBe('Прививок пока нет')
  })
})

describe('one record (MW-03.1: done is read-only)', () => {
  it('offers no change on a done record, only deletion by name, and its next dates', () => {
    const withPlanFromIt = murka.events.map((event) =>
      event.id === plan.id ? { ...event, items: event.items.map((item, n) => ({ ...item, source_item_id: done.items[n].id })) } : event,
    )
    const view = eventRecord(ru, 'ru', id(1), done, withPlanFromIt, TODAY)
    expect(view.editHref).toBeNull()
    expect(view.badge).toBe('Сделано')
    expect(view.actionsBody).toBe('Процедура выполнена. Запись сохранена в истории и недоступна для редактирования.')
    expect(view.removeTitle).toBe('Удалить запись: прививка, 12 марта 2026?')
    expect(view.items.map((item) => [item.name, item.targets, item.next])).toEqual([
      ['Нобивак Tricat Trio', 'Панлейкопения, калицивироз, ринотрахеит', 'Следующая дата: 12 марта 2027'],
      ['Нобивак Rabies', 'Бешенство', 'Следующая дата: 12 марта 2027'],
    ])
  })

  it('lets a plan be changed or cancelled', () => {
    const view = eventRecord(ru, 'ru', id(1), plan, murka.events, TODAY)
    expect(view.editHref).toBe(`/pets/${id(1)}/health/${id(102)}/edit`)
    expect(view.removeTitle).toBe('Отменить план: прививка, 12 марта 2027?')
  })

  it('reads ?saved= strictly', () => {
    expect(parseEventSaved('added')).toBe('added')
    expect(parseEventSaved('nonsense')).toBeNull()
    expect(parseEventSaved(['added'])).toBeNull()
  })
})
