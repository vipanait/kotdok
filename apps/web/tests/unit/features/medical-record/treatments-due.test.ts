import { describe, expect, it } from 'vitest'
import type { HealthEvent, HealthItem } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import {
  changeDoneDay,
  completeDraft,
  completionChanged,
  completionMismatch,
  completionTarget,
  keptFromPlan,
  othersInPlan,
  readCompletion,
} from '@/features/medical-record/events/complete-form'
import { completeErrorTexts, completeFailureText, completionNote, earlierText, nextHint } from '@/features/medical-record/events/complete-form-text'
import { eventSaveFailure } from '@/features/medical-record/events/event-form'
import { eventRecord, eventsPage, parseEventSaved } from '@/features/medical-record/events/event-view'
import {
  MEDICAL_RECORD_STAGE,
  completeOpen,
  medicalRecordHref,
  parseCompleteFrom,
  type MedicalRecordStage,
} from '@/features/medical-record/stage'
import { allDue, dueBlock } from '@/features/medical-record/view-model'
import { DESIGN_TODAY, bobik, murka } from './demo-overviews'

// MW-04: treatments, «Сделано» on one item and «Все сроки», as data.

const TODAY = '2026-09-26'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const petId = murka.pet.id

const find = (n: number) => murka.events.find((event) => event.id === uuid(n)) as HealthEvent
const vaccinePlan = find(102) // two items, 12 March 2027
const fleaPlan = find(104) // one item, overdue since 12 September
const fleaDone = find(103)

const bravecto: HealthItem = { ...fleaPlan.items[0], interval: { value: 12, unit: 'week' } }
const milbemax: HealthItem = { ...find(106).items[0], interval: { value: 3, unit: 'month' } }

describe('which item «Сделано» marks', () => {
  it('marks the only item of a plan, or the one named', () => {
    expect(completionTarget(fleaPlan, null)).toEqual({ kind: 'item', item: fleaPlan.items[0] })
    expect(completionTarget(vaccinePlan, uuid(204))).toEqual({ kind: 'item', item: vaccinePlan.items[1] })
  })

  it('asks which one for a plan of several, and says so when the item is no longer in it', () => {
    expect(completionTarget(vaccinePlan, null)).toEqual({ kind: 'choose', items: vaccinePlan.items })
    expect(completionTarget(vaccinePlan, uuid(999))).toEqual({ kind: 'missing' })
    expect(othersInPlan(vaccinePlan, vaccinePlan.items[0])).toBe(1)
    expect(othersInPlan(fleaPlan, fleaPlan.items[0])).toBe(0)
  })
})

describe('the «Сделано» form (MW-04 criterion 2)', () => {
  it('starts today and suggests the next date in the interval’s own unit', () => {
    const draft = completeDraft(fleaPlan, bravecto, TODAY)
    expect(draft).toMatchObject({ doneOn: TODAY, next: '2026-12-19', nextTouched: false })
    // Done on 24 September: 12 weeks is 17 December, not 3 months (24 December).
    expect(changeDoneDay(draft, bravecto, '2026-09-24', TODAY).next).toBe('2026-12-17')
    expect(changeDoneDay(completeDraft(find(106), milbemax, TODAY), milbemax, '2026-09-24', TODAY).next).toBe('2026-12-24')
  })

  it('leaves a next date the owner set or cleared, and suggests none without an interval', () => {
    const set = { ...completeDraft(fleaPlan, bravecto, TODAY), next: '2027-01-10', nextTouched: true }
    expect(changeDoneDay(set, bravecto, '2026-09-24', TODAY).next).toBe('2027-01-10')
    const cleared = { ...set, next: '' }
    expect(changeDoneDay(cleared, bravecto, '2026-09-24', TODAY).next).toBe('')
    expect(completeDraft(fleaPlan, fleaPlan.items[0], TODAY).next).toBe('')
  })

  it('starts from the plan’s clinic and note, which the done record keeps anyway', () => {
    const plan = { ...fleaPlan, clinic: 'Айболит', notes: 'Капать на холку' }
    expect(completeDraft(plan, bravecto, TODAY)).toMatchObject({ clinic: 'Айболит', notes: 'Капать на холку' })
  })

  it('sends only the contract’s fields', () => {
    const draft = changeDoneDay(completeDraft(fleaPlan, bravecto, TODAY), bravecto, '2026-09-24', TODAY)
    expect(readCompletion({ ...draft, clinic: '  Айболит ' }, TODAY)).toEqual({
      ok: true,
      input: { done_on: '2026-09-24', next_on: '2026-12-17', clinic: 'Айболит', notes: null },
    })
    expect(readCompletion({ ...draft, next: '' }, TODAY)).toMatchObject({ ok: true, input: { next_on: null } })
  })

  it('refuses a day after today, a next date not after it or in the past, and long texts', () => {
    const draft = completeDraft(fleaPlan, bravecto, TODAY)
    expect(readCompletion({ ...draft, doneOn: '2026-09-27' }, TODAY)).toEqual({ ok: false, problems: { doneOn: 'future' } })
    expect(readCompletion({ ...draft, doneOn: '' }, TODAY)).toEqual({ ok: false, problems: { doneOn: 'empty' } })
    expect(readCompletion({ ...draft, next: TODAY }, TODAY)).toEqual({ ok: false, problems: { next: 'notAfter' } })
    expect(readCompletion({ ...draft, doneOn: '2026-01-10', next: '2026-02-10' }, TODAY)).toEqual({ ok: false, problems: { next: 'past' } })
    expect(readCompletion({ ...draft, clinic: 'к'.repeat(101), notes: 'з'.repeat(301) }, TODAY)).toEqual({
      ok: false,
      problems: { clinic: 'tooLong', notes: 'tooLong' },
    })
    expect(completeErrorTexts(ru, { doneOn: 'future', next: 'past' })).toMatchObject({
      doneOn: 'Сделанная процедура не может быть позже сегодняшнего дня',
      next: 'Следующая дата не может быть в прошлом',
    })
  })

  it('asks before leaving only after a change', () => {
    const draft = completeDraft(fleaPlan, bravecto, TODAY)
    expect(completionChanged(draft, { ...draft })).toBe(false)
    expect(completionChanged(draft, changeDoneDay(draft, bravecto, '2026-09-24', TODAY))).toBe(true)
  })

  it('says what the save does: this item only, and the next date', () => {
    const draft = changeDoneDay(completeDraft(vaccinePlan, bravecto, TODAY), bravecto, '2026-09-24', TODAY)
    expect(completionNote(ru, 'ru', 1, draft, TODAY)).toBe(
      'Отметим только эту позицию: ещё 1 позиция останется в плане. Следующий срок — 17 декабря.',
    )
    expect(completionNote(ru, 'ru', 0, { ...draft, next: '' }, TODAY)).toBe(
      'План станет выполненной записью. Следующий срок не будет запланирован.',
    )
    expect(nextHint(ru, 'ru', bravecto)).toContain('12 недель')
    expect(nextHint(ru, 'ru', milbemax)).toContain('3 месяца')
    expect(nextHint(en, 'en', bravecto)).toContain('12 weeks')
  })

  it('says why a save failed and never claims success', () => {
    expect(completeFailureText(ru, eventSaveFailure(new ApiError('conflict', 409, 'x')) as 'alreadySaved')).toContain('уже сохранена раньше')
    expect(completeFailureText(ru, eventSaveFailure(new ApiError('not_found', 404, 'x')) as 'gone')).toContain('позиции плана больше нет')
    expect(completeFailureText(ru, eventSaveFailure(new TypeError('Failed to fetch')) as 'offline')).toContain('Нет связи')
    expect(parseEventSaved('completed')).toBe('completed')
  })
})

describe('fix round 1: no false success, no silent clearing', () => {
  const input = { done_on: '2026-09-24', next_on: '2026-12-17', clinic: null, notes: null }
  const next = (date: string): HealthEvent => ({
    ...fleaPlan,
    id: uuid(990),
    date,
    items: [{ ...fleaPlan.items[0], id: uuid(991), source_item_id: fleaPlan.items[0].id }],
  })

  it('takes a 200 as success only when the record is the one sent', () => {
    const saved = { ...fleaPlan, status: 'done' as const, date: '2026-09-24' }
    expect(completionMismatch(input, saved, fleaPlan.items[0].id, [saved, next('2026-12-17')])).toBeNull()
    // The day was already saved differently: the answer is the earlier record.
    expect(completionMismatch(input, { ...saved, date: '2026-09-26' }, fleaPlan.items[0].id, null)).toBe('doneOn')
    // The same day, but the next plan is another (or none).
    expect(completionMismatch(input, saved, fleaPlan.items[0].id, [saved, next('2026-12-19')])).toBe('next')
    expect(completionMismatch(input, saved, fleaPlan.items[0].id, [saved])).toBe('next')
    expect(completionMismatch({ ...input, next_on: null }, saved, fleaPlan.items[0].id, [saved, next('2026-12-17')])).toBe('next')
    // The record could not be read again: the day alone decides.
    expect(completionMismatch(input, saved, fleaPlan.items[0].id, null)).toBeNull()
    expect(earlierText(ru, 'doneOn', '2026-09-26')).toContain('уже была отмечена сделанной раньше — 26 сентября 2026')
    expect(earlierText(ru, 'next', '2026-09-24')).toContain('с другой следующей датой')
  })

  it('says which of the plan’s texts stay when a field is left empty', () => {
    const plan = { ...fleaPlan, clinic: 'Айболит', notes: 'Капать на холку' }
    const item = plan.items[0]
    expect(keptFromPlan(plan, item, { clinic: '', notes: '' })).toEqual({ clinic: 'Айболит', notes: 'Капать на холку' })
    expect(keptFromPlan(plan, item, { clinic: 'Другая', notes: 'Своя' })).toEqual({ clinic: null, notes: null })
    // A plan of several: the item gets its own record, whose note is only what is sent.
    const several = { ...vaccinePlan, clinic: 'Айболит', notes: 'Общая' }
    expect(keptFromPlan(several, several.items[0], { clinic: ' ', notes: '' })).toEqual({ clinic: 'Айболит', notes: null })
    expect(keptFromPlan({ ...plan, clinic: null, notes: null }, item, { clinic: '', notes: '' })).toEqual({ clinic: null, notes: null })
  })
})

describe('where «Сделано» is offered', () => {
  const closed: MedicalRecordStage = { ...MEDICAL_RECORD_STAGE, due: false }

  it('for vaccinations and treatments once the due stage is on; a visit is marked on its own form', () => {
    expect(completeOpen('vaccination')).toBe(true)
    expect(completeOpen('parasite')).toBe(true)
    expect(completeOpen('visit')).toBe(false)
    expect(completeOpen('parasite', closed)).toBe(false)
  })

  it('addresses one item and remembers where it was pressed', () => {
    expect(medicalRecordHref.complete(petId, uuid(104), uuid(206))).toBe(`/pets/${petId}/health/${uuid(104)}/complete?item=${uuid(206)}`)
    expect(medicalRecordHref.complete(petId, uuid(102), null, 'due')).toBe(`/pets/${petId}/health/${uuid(102)}/complete?from=due`)
    expect(parseCompleteFrom('due')).toBe('due')
    expect(parseCompleteFrom('elsewhere')).toBe('record')
  })

  it('on a plan’s page: one item goes straight to the form, several ask first; nothing on a done record', () => {
    const one = eventRecord(ru, 'ru', petId, fleaPlan, murka.events, DESIGN_TODAY, murka.writable)
    expect(one.completeHref).toBe(`/pets/${petId}/health/${uuid(104)}/complete?item=${uuid(206)}`)
    const several = eventRecord(ru, 'ru', petId, vaccinePlan, murka.events, DESIGN_TODAY, murka.writable)
    expect(several.completeHref).toBe(`/pets/${petId}/health/${uuid(102)}/complete`)
    const done = eventRecord(ru, 'ru', petId, fleaDone, murka.events, DESIGN_TODAY, murka.writable)
    expect([done.completeHref, done.editHref, done.removable]).toEqual([null, null, true])
  })

  it('offers no action where the server does not store the kind', () => {
    const older = eventRecord(ru, 'ru', petId, fleaPlan, murka.events, DESIGN_TODAY, ['vaccinations', 'weight'])
    expect([older.completeHref, older.editHref, older.removable]).toEqual([null, null, false])
  })
})

describe('«Все сроки» and the record’s «Сроки»', () => {
  it('lists every due date overdue first, then the soonest, then the rest', () => {
    const due = allDue(ru, 'ru', murka, DESIGN_TODAY)
    expect(due.total).toBe(5)
    expect(due.rows.map((row) => [row.title, row.status, row.tone])).toEqual([
      ['Блохи и клещи', 'Просрочено на 12 дней · 12 сентября', 'overdue'],
      ['Осмотр', 'Через 9 дней · 3 октября', 'soon'],
      ['Глисты', 'Через 11 дней · 5 октября', 'soon'],
      ['Комплексная прививка', '12 марта 2027', 'later'],
      ['Бешенство', '12 марта 2027', 'later'],
    ])
  })

  it('gives each item its own «Сделано», named for a screen reader; a planned visit its «Состоялся» (MW-06)', () => {
    const rows = allDue(ru, 'ru', murka, DESIGN_TODAY).rows
    expect(rows[0].completeHref).toBe(`/pets/${petId}/health/${uuid(104)}/complete?item=${uuid(206)}&from=due`)
    expect(rows[0].completeLabel).toBe('Сделано: Блохи и клещи, просрочено на 12 дней · 12 сентября')
    expect(rows[0].completeText).toBe('Сделано')
    expect(rows[1].completeHref).toBe(`/pets/${petId}/health/${uuid(108)}/complete?from=due`)
    expect(rows[1].completeText).toBe('Состоялся')
    expect(rows[1].completeLabel).toBe('Состоялся: Осмотр, через 9 дней · 3 октября')
    // The two vaccines of one plan: two rows, two items, one plan.
    expect(rows[3].completeHref).toContain(`${uuid(102)}/complete?item=${uuid(203)}`)
    expect(rows[4].completeHref).toContain(`${uuid(102)}/complete?item=${uuid(204)}`)
  })

  it('shows the first three in the record, returning there from «Сделано»', () => {
    const block = dueBlock(ru, 'ru', murka, DESIGN_TODAY)
    expect(block.rows).toHaveLength(3)
    expect(block.rows[0].completeHref).toContain('from=medical')
    expect(dueBlock(ru, 'ru', murka, DESIGN_TODAY, { ...MEDICAL_RECORD_STAGE, due: false }).rows[0].completeHref).toBeNull()
    expect(allDue(ru, 'ru', bobik, DESIGN_TODAY)).toEqual({ rows: [], total: 0 })
    // An older server that does not store treatments: no «Сделано» that would fail.
    const older = { ...murka, writable: ['vaccinations' as const, 'weight' as const] }
    expect(allDue(ru, 'ru', older, DESIGN_TODAY).rows.map((row) => row.completeHref !== null)).toEqual([false, false, false, true, true])
  })
})

describe('the parasites section (web v1 «parasites», «parasites-empty»)', () => {
  it('lists plans and done treatments, each saying what it covered', () => {
    const view = eventsPage(ru, 'ru', 'parasite', murka, DESIGN_TODAY)
    expect(view.subtitle).toBe('Мурка · Обработки и следующие сроки')
    expect(view.planned.map((card) => [card.day, card.items, card.due?.text ?? null])).toEqual([
      ['12 сентября 2026', ['Бравекто Спот-он · блохи, клещи'], 'Просрочено на 12 дней · 12 сентября'],
      ['5 октября 2026', ['Мильбемакс · глисты'], 'Через 11 дней · 5 октября'],
    ])
    expect(view.done.map((card) => card.day)).toEqual(['5 июля 2026', '20 июня 2026'])
    expect(view.core).toBeNull()
  })

  it('shows fleas with ticks and worms: the last, the next and its «Сделано»', () => {
    const [fleasTicks, worms] = eventsPage(ru, 'ru', 'parasite', murka, DESIGN_TODAY).covers ?? []
    expect(fleasTicks).toMatchObject({
      title: 'Блохи и клещи',
      last: 'Последняя — 20 июня',
      product: 'Бравекто Спот-он',
      next: { text: 'Просрочено на 12 дней · 12 сентября', tone: 'overdue' },
      completeHref: `/pets/${petId}/health/${uuid(104)}/complete?item=${uuid(206)}&from=section`,
    })
    expect(worms).toMatchObject({ title: 'Глисты', last: 'Последняя — 5 июля', next: { tone: 'soon' } })
    const later = eventsPage(ru, 'ru', 'parasite', murka, '2026-09-01').covers?.[1]
    expect(later?.next).toEqual({ text: 'Следующая — 5 октября', tone: 'later' })
  })

  it('has nothing to say for a pet with no treatments but where to add one', () => {
    const view = eventsPage(ru, 'ru', 'parasite', bobik, DESIGN_TODAY)
    expect(view.empty).toEqual({ title: 'Обработок пока нет', body: 'Добавьте сделанные обработки или запланируйте следующие.' })
    expect(view.covers?.map((card) => [card.last, card.next.text, card.completeHref])).toEqual([
      ['Обработок не записано', 'Следующая не запланирована', null],
      ['Обработок не записано', 'Следующая не запланирована', null],
    ])
  })
})
