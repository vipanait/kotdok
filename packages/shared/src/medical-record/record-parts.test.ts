import { describe, expect, it } from 'vitest'
import type { HealthOverview, Medication, Pet, WeightMeasurement } from '@lapka/contracts'
import {
  coursePeriodParts,
  dayRef,
  dueStatusParts,
  dueTitleParts,
  headFactsData,
  importantFactsData,
  itemNameParts,
  trendParts,
  weightParts,
} from './record-parts'

/**
 * The medical record's words, worked out once for the site and the phone:
 * what a line says, as parts each app puts into its own language. The rules
 * that had drifted between the two copies — grams for a newborn, a course
 * that starts later, the names of parasite groups — live here now.
 */
const TODAY = '2026-10-25'

const pet = (overrides: Partial<Pet> = {}): Pet => ({
  id: 'pet-1', species: 'cat', name: 'Мурка', breed: 'Сибирская', age_years: 3, weight_kg: 4.2, sex: 'female', neutered: true,
  indoor_outdoor: null, diet: null, size_class: null, walk_activity: null, allergies: ['курица'], vaccinated: null,
  chronic_conditions: [], medications: ['Витамины'], notes: null, birth_date: null, birth_date_approx: false, adopted_on: '2026-10-01',
  avatar_url: null, created_at: '2026-01-01T00:00:00.000Z', ...overrides,
})
const weight = (id: string, measured_on: string | null, weight_kg: number): WeightMeasurement => ({ id, measured_on, weight_kg, source: 'record' })
const course = (overrides: Partial<Medication>): Medication => ({
  id: 'm-1', name: 'Апоквел', dosage: '1 таб', started_on: '2026-10-01', ended_on: null, ongoing: false, source: 'record',
  reminder_times: [], ...overrides,
})
const overview = (overrides: Partial<HealthOverview> = {}): HealthOverview => ({
  pet: pet(), writable: ['vaccinations', 'parasites', 'visits', 'medications', 'weight'], weights: [], events: [], medications: [], ...overrides,
})

describe('dayRef', () => {
  it('asks for the year only outside the current one', () => {
    expect(dayRef('2026-09-12', TODAY)).toEqual({ day: '2026-09-12', withYear: false })
    expect(dayRef('2025-09-12', TODAY)).toEqual({ day: '2025-09-12', withYear: true })
  })
})

describe('dueStatusParts', () => {
  it('names today, tomorrow and the days ahead within the soon window', () => {
    expect(dueStatusParts('2026-10-25', TODAY)).toMatchObject({ tone: 'soon', when: { kind: 'today' } })
    expect(dueStatusParts('2026-10-26', TODAY)).toMatchObject({ tone: 'soon', when: { kind: 'tomorrow' } })
    expect(dueStatusParts('2026-10-30', TODAY)).toMatchObject({ tone: 'soon', when: { kind: 'inDays', days: 5 } })
  })

  it('is the date alone past the soon window', () => {
    expect(dueStatusParts('2027-03-12', TODAY)).toEqual({ tone: 'later', day: { day: '2027-03-12', withYear: true } })
  })

  it('counts an overdue date in days, then only since when', () => {
    expect(dueStatusParts('2026-10-24', TODAY)).toMatchObject({ tone: 'overdue', since: { kind: 'yesterday' } })
    expect(dueStatusParts('2026-10-13', TODAY)).toMatchObject({ tone: 'overdue', since: { kind: 'days', days: 12 } })
    expect(dueStatusParts('2026-07-23', TODAY)).toMatchObject({ tone: 'overdue', since: { kind: 'long' }, day: { day: '2026-07-23', withYear: false } })
  })
})

describe('dueTitleParts', () => {
  const item = (targets: string[], name: string | null = null) => ({ name, targets })

  it('names a visit by its kind, a treatment by its groups, a vaccination by its disease', () => {
    expect(dueTitleParts('visit', null, 'checkup')).toEqual({ kind: 'visit', visitKind: 'checkup' })
    expect(dueTitleParts('visit', null, null)).toEqual({ kind: 'visit', visitKind: null })
    expect(dueTitleParts('parasite', item(['fleas', 'ticks'], 'Бравекто'), null)).toEqual({ kind: 'parasiteGroups', groups: ['fleas', 'ticks'] })
    expect(dueTitleParts('vaccination', item(['rabies'], 'Нобивак'), null)).toEqual({ kind: 'target', target: 'rabies' })
    expect(dueTitleParts('vaccination', item(['panleukopenia', 'calicivirus']), null)).toEqual({ kind: 'complexVaccination' })
  })

  it('falls back to the owner’s name, then to «no product»', () => {
    expect(dueTitleParts('vaccination', item([], 'Своё название'), null)).toEqual({ kind: 'name', name: 'Своё название' })
    expect(dueTitleParts('parasite', item(['mites'], 'Милбемакс'), null)).toEqual({ kind: 'name', name: 'Милбемакс' })
    expect(dueTitleParts('parasite', item([]), null)).toEqual({ kind: 'noProduct' })
  })
})

describe('itemNameParts', () => {
  it('is the name when there is one, else what it was against', () => {
    expect(itemNameParts('vaccination', { name: 'Нобивак', targets: ['rabies'] })).toEqual({ kind: 'name', name: 'Нобивак' })
    expect(itemNameParts('vaccination', { name: null, targets: ['panleukopenia', 'calicivirus'] })).toEqual({ kind: 'targets', targets: ['panleukopenia', 'calicivirus'] })
    expect(itemNameParts('parasite', { name: null, targets: ['fleas', 'ticks'] })).toEqual({ kind: 'parasiteGroups', groups: ['fleas', 'ticks'] })
    expect(itemNameParts('vaccination', { name: null, targets: [] })).toEqual({ kind: 'noProduct' })
  })
})

describe('weightParts', () => {
  it('writes a newborn in grams and everything else to a tenth of a kilogram', () => {
    expect(weightParts(0.085)).toEqual({ unit: 'g', grams: 85 })
    expect(weightParts(0.999)).toEqual({ unit: 'g', grams: 999 })
    expect(weightParts(1)).toEqual({ unit: 'kg', kg: 1 })
    expect(weightParts(4.25)).toEqual({ unit: 'kg', kg: 4.3 })
    expect(weightParts(28)).toEqual({ unit: 'kg', kg: 28 })
  })
})

describe('trendParts', () => {
  it('rounds the change and picks months or days for the span', () => {
    expect(trendParts({ change: -0.34, months: 6, days: 183 })).toEqual({ change: -0.3, span: { kind: 'months', n: 6 } })
    expect(trendParts({ change: 0, months: 0, days: 12 })).toEqual({ change: 0, span: { kind: 'days', n: 12 } })
  })
})

describe('headFactsData', () => {
  it('collects what the head says from the form and the record', () => {
    const history = [weight('w1', '2026-04-25', 4.5), weight('w2', '2026-10-20', 4.2)]
    expect(headFactsData(overview({ weights: history }), TODAY)).toEqual({
      name: 'Мурка', species: 'cat', sex: 'female', breed: 'Сибирская', ageYears: 3, neutered: true,
      weight: { unit: 'kg', kg: 4.2 },
      weightNote: { kind: 'trend', trend: { change: -0.3, span: { kind: 'months', n: 5 } } },
      togetherDays: 25,
    })
  })

  it('says the form’s weight has no date, or names the one weighing', () => {
    expect(headFactsData(overview({ pet: pet({ weight_kg: 28, adopted_on: null, breed: null, neutered: null }) }), TODAY)).toMatchObject({
      breed: null, neutered: false, weight: { unit: 'kg', kg: 28 }, weightNote: { kind: 'fromForm' }, togetherDays: null,
    })
    expect(headFactsData(overview({ weights: [weight('w1', '2026-09-12', 4.2)] }), TODAY).weightNote).toEqual({ kind: 'day', day: { day: '2026-09-12', withYear: false } })
    expect(headFactsData(overview({ pet: pet({ weight_kg: null }) }), TODAY)).toMatchObject({ weight: null, weightNote: null })
  })
})

describe('importantFactsData', () => {
  it('takes the medicines from the courses given now, the form’s list without any', () => {
    const courses = [course({ id: 'a', name: 'Апоквел' }), course({ id: 'b', name: 'Витамины', ongoing: true, started_on: null }), course({ id: 'c', name: 'Позже', started_on: '2026-11-01' }), course({ id: 'd', name: 'Было', started_on: '2026-01-01', ended_on: '2026-02-01' })]
    expect(importantFactsData(overview({ medications: courses }), TODAY)).toEqual({
      allergies: ['курица'], chronic: [], taking: [{ name: 'Апоквел', ongoing: false }, { name: 'Витамины', ongoing: true }],
    })
    expect(importantFactsData(overview(), TODAY).taking).toEqual([{ name: 'Витамины', ongoing: false }])
  })
})

describe('coursePeriodParts', () => {
  it('describes a course by what its dates say', () => {
    expect(coursePeriodParts(course({ started_on: '2026-08-02', ended_on: '2026-08-15' }), TODAY)).toEqual({ kind: 'range', from: dayRef('2026-08-02', TODAY), to: dayRef('2026-08-15', TODAY), sameMonth: true })
    expect(coursePeriodParts(course({ started_on: '2025-12-28', ended_on: '2026-01-15' }), TODAY)).toEqual({ kind: 'range', from: { day: '2025-12-28', withYear: true }, to: { day: '2026-01-15', withYear: true }, sameMonth: false })
    expect(coursePeriodParts(course({ started_on: '2026-08-02', ended_on: '2026-08-02' }), TODAY)).toEqual({ kind: 'day', day: dayRef('2026-08-02', TODAY) })
    expect(coursePeriodParts(course({ started_on: '2026-11-03' }), TODAY)).toEqual({ kind: 'startsLater', day: dayRef('2026-11-03', TODAY) })
    expect(coursePeriodParts(course({ started_on: '2026-08-02', ongoing: true }), TODAY)).toEqual({ kind: 'since', day: dayRef('2026-08-02', TODAY), ongoing: true })
    expect(coursePeriodParts(course({ started_on: '2026-08-02' }), TODAY)).toEqual({ kind: 'since', day: dayRef('2026-08-02', TODAY), ongoing: false })
    expect(coursePeriodParts(course({ started_on: null, ended_on: '2026-11-15' }), TODAY)).toEqual({ kind: 'until', day: dayRef('2026-11-15', TODAY) })
    expect(coursePeriodParts(course({ started_on: null, ongoing: true }), TODAY)).toEqual({ kind: 'ongoing' })
    expect(coursePeriodParts(course({ started_on: null, source: 'form', dosage: null }), TODAY)).toEqual({ kind: 'fromForm' })
    expect(coursePeriodParts(course({ started_on: null }), TODAY)).toEqual({ kind: 'noDates' })
  })

  it('a course that starts later and is marked ongoing is since its day, as the site shows it', () => {
    expect(coursePeriodParts(course({ started_on: '2026-11-03', ongoing: true }), TODAY)).toEqual({ kind: 'since', day: dayRef('2026-11-03', TODAY), ongoing: true })
  })
})
