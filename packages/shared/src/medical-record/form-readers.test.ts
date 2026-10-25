import { describe, expect, it } from 'vitest'
import type { HealthEvent, Medication } from '@lapka/contracts'
import {
  courseProblems,
  courseValue,
  eventProblems,
  eventPatchItems,
  readCourseChange,
  readEventInput,
  readHeldVisit,
  readNewCourses,
  readNewVisit,
  readVisitPlanChange,
  visitProblems,
  type CourseFields,
  type EventFields,
  type VisitFields,
} from './form-readers'

/**
 * The record forms, read once for the site and the phone: what is wrong with
 * the fields as codes, and the body the contract takes. Each app parses its
 * own text fields into these (a typed day into `YYYY-MM-DD`, a next-date
 * choice into a day) and says the codes in its own words.
 */
const TODAY = '2026-10-25'

const item = (over: Partial<EventFields['items'][number]> = {}): EventFields['items'][number] => ({
  key: 'i1', name: 'Нобивак', targets: ['rabies'], productId: null, next: '', ...over,
})
const event = (over: Partial<EventFields> = {}): EventFields => ({
  kind: 'vaccination', status: 'done', date: TODAY, items: [item()], clinic: '', notes: '', ...over,
})

describe('eventProblems', () => {
  it('finds nothing wrong with a done record of today', () => {
    expect(eventProblems(event(), TODAY, { keptDate: null, withNext: true })).toEqual({})
  })

  it('names the day, the items and the texts by the shared rules', () => {
    expect(eventProblems(event({ date: '' }), TODAY, { keptDate: null, withNext: true })).toEqual({ date: 'empty' })
    expect(eventProblems(event({ date: '2027-01-01' }), TODAY, { keptDate: null, withNext: true })).toEqual({ date: 'future' })
    expect(eventProblems(event({ status: 'planned', date: '2026-01-01' }), TODAY, { keptDate: null, withNext: false })).toEqual({ date: 'past' })
    // An overdue plan being corrected may keep its own day.
    expect(eventProblems(event({ status: 'planned', date: '2026-01-01' }), TODAY, { keptDate: '2026-01-01', withNext: false })).toEqual({})
    expect(eventProblems(event({ items: [] }), TODAY, { keptDate: null, withNext: true })).toEqual({ items: 'none' })
    expect(eventProblems(event({ clinic: 'x'.repeat(300) }), TODAY, { keptDate: null, withNext: true })).toEqual({ clinic: 'tooLong' })
  })

  it('needs a name or a disease on each item, and a next day after the record’s', () => {
    expect(eventProblems(event({ items: [item({ name: '', targets: [] })] }), TODAY, { keptDate: null, withNext: true })).toEqual({ item: { i1: { empty: true } } })
    expect(eventProblems(event({ items: [item({ name: 'x'.repeat(200) })] }), TODAY, { keptDate: null, withNext: true })).toEqual({ item: { i1: { name: 'tooLong' } } })
    expect(eventProblems(event({ items: [item({ next: '2026-10-20' })] }), TODAY, { keptDate: null, withNext: true })).toEqual({ item: { i1: { next: 'notAfter' } } })
    expect(eventProblems(event({ items: [item({ next: 'nope' })] }), TODAY, { keptDate: null, withNext: true })).toEqual({ item: { i1: { next: 'invalid' } } })
    // A next day is not read for a plan, nor when the form does not take one.
    expect(eventProblems(event({ items: [item({ next: 'nope' })] }), TODAY, { keptDate: null, withNext: false })).toEqual({})
  })
})

describe('readEventInput', () => {
  it('builds the contract’s body, empty texts and days as none', () => {
    const read = readEventInput(event({ items: [item({ next: '2027-10-25' })], clinic: '  Vet  ' }), TODAY, { keptDate: null, withNext: true })
    expect(read).toEqual({
      ok: true,
      input: { kind: 'vaccination', status: 'done', date: TODAY, clinic: 'Vet', notes: null, items: [{ name: 'Нобивак', targets: ['rabies'], product_id: null, next_on: '2027-10-25' }] },
    })
  })

  it('sends no next day for a plan, and keeps an existing item’s id only in a correction', () => {
    const kept = item({ id: '00000000-0000-4000-8000-000000000001', next: 'ignored' })
    const read = readEventInput(event({ status: 'planned', date: '2026-11-05', items: [kept] }), TODAY, { keptDate: null, withNext: false })
    expect(read.ok && read.input.items[0]).toEqual({ name: 'Нобивак', targets: ['rabies'], product_id: null })
    expect(eventPatchItems({ items: [kept, item({ key: 'i2', name: ' Новый ' })] })).toEqual([
      { id: '00000000-0000-4000-8000-000000000001', name: 'Нобивак', targets: ['rabies'], product_id: null },
      { name: 'Новый', targets: ['rabies'], product_id: null },
    ])
  })

  it('answers the problems instead of a body', () => {
    expect(readEventInput(event({ items: [] }), TODAY, { keptDate: null, withNext: true })).toEqual({ ok: false, problems: { items: 'none' } })
  })
})

const fields = (over: Partial<CourseFields> = {}): CourseFields => ({ key: 'c1', name: 'Апоквел', dosage: '1 таб', start: '2026-10-01', end: '', ongoing: false, ...over })
const course = (over: Partial<Medication> = {}): Medication => ({ id: 'c1', name: 'Апоквел', dosage: '1 таб', started_on: '2026-10-01', ended_on: null, ongoing: false, source: 'record', reminder_times: [], ...over })

describe('courses', () => {
  it('checks a course as the server will', () => {
    expect(courseProblems(fields(), false)).toEqual({})
    expect(courseProblems(fields({ name: ' ' }), false)).toEqual({ name: 'empty' })
    expect(courseProblems(fields({ start: '' }), false)).toEqual({ start: 'empty' })
    expect(courseProblems(fields({ start: '' }), true)).toEqual({})
    expect(courseProblems(fields({ end: '2026-09-01' }), false)).toEqual({ end: 'beforeStart' })
    expect(courseProblems(fields({ dosage: 'x'.repeat(200) }), false)).toEqual({ dosage: 'tooLong' })
  })

  it('sends «Постоянно» without an end, and empty texts as none', () => {
    expect(courseValue(fields({ dosage: ' ', end: '2026-12-01', ongoing: true }))).toEqual({ name: 'Апоквел', dosage: null, started_on: '2026-10-01', ended_on: null, ongoing: true })
  })

  it('reads one save of new courses whole, or none', () => {
    expect(readNewCourses([])).toEqual({ ok: false, problems: { items: 'none' } })
    expect(readNewCourses([fields(), fields({ key: 'c2', name: '' })])).toEqual({ ok: false, problems: { course: { c2: { name: 'empty' } } } })
    expect(readNewCourses([fields()])).toMatchObject({ ok: true, value: { items: [{ name: 'Апоквел' }] } })
  })

  it('sends only what changed on a correction', () => {
    expect(readCourseChange(course(), fields())).toEqual({ ok: true, value: null })
    expect(readCourseChange(course(), fields({ end: '2026-12-01' }))).toEqual({ ok: true, value: { ended_on: '2026-12-01' } })
    expect(readCourseChange(course({ started_on: null, source: 'form' }), fields({ start: '' }))).toEqual({ ok: true, value: null })
  })
})

const visit = (over: Partial<VisitFields> = {}): VisitFields => ({
  status: 'done', date: TODAY, visitKind: 'checkup', clinic: '', reason: '', diagnosis: '', prescriptions: [], checkId: null, notes: '', ...over,
})
const plan: HealthEvent = {
  id: 'v1', kind: 'visit', status: 'planned', date: '2026-11-10', visit_kind: 'checkup', clinic: null, notes: null, reason: 'Осмотр', diagnosis: null, check_id: null,
  items: [],
} as unknown as HealthEvent

describe('visits', () => {
  it('reads a plan’s texts without its diagnosis, and a done visit’s prescriptions', () => {
    expect(visitProblems(visit({ status: 'planned', date: '2026-11-10', diagnosis: 'x'.repeat(5000) }), TODAY, null)).toEqual({})
    expect(visitProblems(visit({ diagnosis: 'x'.repeat(5000) }), TODAY, null)).toEqual({ texts: ['diagnosis'] })
    expect(visitProblems(visit({ prescriptions: [{ key: 'p1', name: '', instructions: '', toMedicines: true }] }), TODAY, null)).toEqual({ prescription: { p1: { name: 'empty' } } })
  })

  it('builds a new visit, a prescription with its id kept and one to start a course', () => {
    const read = readNewVisit(
      visit({ reason: ' Осмотр ', diagnosis: 'Гастрит', prescriptions: [{ key: 'p1', name: 'Фортифлора', instructions: '', toMedicines: true }, { key: 'p2', id: '00000000-0000-4000-8000-000000000002', name: 'Старое', instructions: 'утром', toMedicines: false }] }),
      TODAY,
    )
    expect(read).toMatchObject({
      ok: true,
      value: {
        status: 'done', date: TODAY, visit_kind: 'checkup', reason: 'Осмотр', diagnosis: 'Гастрит',
        prescriptions: [{ name: 'Фортифлора', instructions: null, add_to_medications: true }, { id: '00000000-0000-4000-8000-000000000002', name: 'Старое', instructions: 'утром' }],
      },
    })
  })

  it('changes a plan by what differs, and marks it held whole', () => {
    const same = visit({ status: 'planned', date: '2026-11-10', reason: 'Осмотр' })
    expect(readVisitPlanChange(plan, same, TODAY)).toEqual({ ok: true, value: null })
    expect(readVisitPlanChange(plan, { ...same, clinic: 'Vet' }, TODAY)).toEqual({ ok: true, value: { clinic: 'Vet' } })
    expect(readHeldVisit(plan, visit({ date: TODAY, reason: 'Осмотр' }), TODAY)).toMatchObject({ ok: true, value: { status: 'done', date: TODAY, prescriptions: [] } })
  })
})
