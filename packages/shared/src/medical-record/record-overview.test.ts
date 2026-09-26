import { describe, expect, it } from 'vitest'
import type { HealthEvent, Medication, WeightMeasurement } from '@lapka/contracts'
import {
  addMonths,
  daysBetween,
  dueEntries,
  dueTiming,
  doneEvents,
  isCurrentCourse,
  localToday,
  nearestDueByPet,
  parasiteGroups,
  petFormHints,
  splitCourses,
  lastDoneDate,
  weightTrend,
  weightsInPeriod,
} from './record-overview'

const TODAY = '2026-09-24'

function event(overrides: Partial<HealthEvent> & Pick<HealthEvent, 'id' | 'kind' | 'status' | 'date'>): HealthEvent {
  return {
    clinic: null,
    notes: null,
    items: [],
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
    ...overrides,
  }
}

function item(id: string, targets: string[], name: string | null = null) {
  return { id, name, targets, source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null }
}

const weight = (id: string, measured_on: string | null, weight_kg: number, source: 'record' | 'form' = 'record'): WeightMeasurement => ({
  id,
  measured_on,
  weight_kg,
  source,
})

describe('calendar days', () => {
  it('counts days across a month and a year without a time zone', () => {
    expect(daysBetween('2026-09-24', '2026-10-03')).toBe(9)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-09-24', '2026-09-12')).toBe(-12)
  })

  it('keeps the end of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-09-24', -12)).toBe('2025-09-24')
  })
})

describe('due timing (spec §8)', () => {
  it('reads overdue, soon and later as calendar days', () => {
    expect(dueTiming('2026-09-12', TODAY)).toEqual({ tone: 'overdue', days: -12, longOverdue: false })
    expect(dueTiming('2026-09-23', TODAY)).toEqual({ tone: 'overdue', days: -1, longOverdue: false })
    expect(dueTiming(TODAY, TODAY)).toEqual({ tone: 'soon', days: 0, longOverdue: false })
    expect(dueTiming('2026-10-08', TODAY)).toEqual({ tone: 'soon', days: 14, longOverdue: false })
    expect(dueTiming('2026-10-09', TODAY)).toEqual({ tone: 'later', days: 15, longOverdue: false })
  })

  it('names the date instead of the count past two months', () => {
    expect(dueTiming('2026-06-12', TODAY).longOverdue).toBe(true)
    expect(dueTiming('2026-07-25', TODAY).longOverdue).toBe(false)
  })
})

describe('due entries', () => {
  const events = [
    event({ id: 'e1', kind: 'vaccination', status: 'done', date: '2026-03-12', items: [item('i0', ['rabies'])] }),
    event({ id: 'e2', kind: 'parasite', status: 'planned', date: '2026-10-05', items: [item('i1', ['worms'])] }),
    event({ id: 'e3', kind: 'parasite', status: 'planned', date: '2026-09-12', items: [item('i2', ['fleas', 'ticks'])] }),
    event({ id: 'e4', kind: 'visit', status: 'planned', date: '2026-10-03', visit_kind: 'checkup' }),
    event({ id: 'e5', kind: 'vaccination', status: 'planned', date: '2027-03-12', items: [item('i3', ['rabies']), item('i4', ['panleukopenia'])] }),
  ]

  it('lists every planned item and planned visit, overdue first, then the soonest', () => {
    const due = dueEntries(events)
    expect(due.map((entry) => entry.key)).toEqual(['i2', 'e4', 'i1', 'i3', 'i4'])
    expect(due[1]).toMatchObject({ kind: 'visit', item: null, date: '2026-10-03' })
  })

  it('leaves done records out', () => {
    expect(dueEntries(events).some((entry) => entry.event.status === 'done')).toBe(false)
    expect(doneEvents(events, 'vaccination').map((e) => e.id)).toEqual(['e1'])
    expect(lastDoneDate(events, 'vaccination')).toBe('2026-03-12')
    expect(lastDoneDate(events, 'parasite')).toBeNull()
  })
})

describe('parasite groups', () => {
  it('folds the fine codes into fleas, ticks and worms in a fixed order', () => {
    expect(parasiteGroups(['worms', 'ear_mites', 'fleas'])).toEqual(['fleas', 'ticks', 'worms'])
    expect(parasiteGroups(['heartworm'])).toEqual(['worms'])
    expect(parasiteGroups([])).toEqual([])
  })
})

describe('weight trend', () => {
  it('compares the latest weight with the earliest of the year', () => {
    const weights = [weight('c', '2026-09-12', 4.2), weight('a', '2026-03-12', 4.5), weight('b', '2026-06-20', 4.4)]
    expect(weightTrend(weights, TODAY)).toEqual({ change: -0.3, months: 6, days: 184 })
  })

  it('compares within a chosen period: the chart’s own span', () => {
    const weights = [weight('c', '2026-09-12', 4.2), weight('a', '2026-03-12', 4.5), weight('b', '2026-06-20', 4.4), weight('d', '2024-09-01', 3.9)]
    expect(weightTrend(weights, TODAY, 'halfYear')).toEqual({ change: -0.2, months: 2, days: 84 })
    expect(weightTrend(weights, TODAY, 'all')).toMatchObject({ change: 0.3, months: 24 })
    // The header's line keeps the year.
    expect(weightTrend(weights, TODAY)).toEqual(weightTrend(weights, TODAY, 'year'))
  })

  it('says nothing about one point or the undated form value', () => {
    expect(weightTrend([weight('a', null, 28, 'form')], TODAY)).toBeNull()
    expect(weightTrend([weight('a', null, 28, 'form'), weight('b', '2026-09-01', 27)], TODAY)).toBeNull()
  })

  it('keeps the period’s dated measurements, oldest first', () => {
    const weights = [weight('c', '2026-09-01', 4.2), weight('a', '2025-01-01', 4), weight('b', '2026-01-01', 4.1), weight('f', null, 4, 'form')]
    expect(weightsInPeriod(weights, 'year', TODAY).map((w) => w.id)).toEqual(['b', 'c'])
    expect(weightsInPeriod(weights, 'halfYear', TODAY).map((w) => w.id)).toEqual(['c'])
    expect(weightsInPeriod(weights, 'all', TODAY).map((w) => w.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('courses', () => {
  const course = (id: string, started_on: string | null, ended_on: string | null): Medication => ({
    id,
    name: id,
    dosage: null,
    started_on,
    ended_on,
    ongoing: ended_on === null,
    source: 'record',
  })

  it('treats a course that ends today as finished', () => {
    expect(isCurrentCourse(course('a', '2026-09-01', TODAY), TODAY)).toBe(false)
    expect(isCurrentCourse(course('a', '2026-09-01', '2026-09-25'), TODAY)).toBe(true)
    expect(isCurrentCourse(course('a', null, null), TODAY)).toBe(true)
  })

  it('puts current courses first, then the finished ones by their end', () => {
    const { current, past } = splitCourses(
      [course('old', '2026-01-01', '2026-01-10'), course('food', '2026-08-02', null), course('flora', '2026-08-02', '2026-08-15')],
      TODAY,
    )
    expect(current.map((c) => c.id)).toEqual(['food'])
    expect(past.map((c) => c.id)).toEqual(['flora', 'old'])
  })
})

describe('local today', () => {
  it('reads the calendar day of the given moment on the local clock', () => {
    expect(localToday(new Date(2026, 8, 24, 0, 30))).toBe('2026-09-24')
    expect(localToday(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
  })
})

describe('the pet list’s due line (spec §7.1, MW-08)', () => {
  const due = (pet_id: string, date: string, name: string) => ({ pet_id, date, name })

  it('keeps each pet’s earliest date, only when overdue or within fourteen days', () => {
    const lines = nearestDueByPet(
      [
        due('murka', '2026-10-01', 'rabies'),
        due('murka', '2026-09-12', 'fleas'),
        due('bobik', '2026-10-20', 'distemper'),
        due('baron', '2026-10-08', 'visit'),
        due('baron', '2026-10-08', 'worms'),
      ],
      TODAY,
    )
    // The earliest, overdue, not the first in the list.
    expect(lines.murka.name).toBe('fleas')
    // 26 days away: past the fourteen, no line at all.
    expect(lines.bobik).toBeUndefined()
    // Day 14 is still "soon"; a tie keeps the list's order.
    expect(lines.baron.name).toBe('visit')
    expect(Object.keys(lines).sort()).toEqual(['baron', 'murka'])
  })

  it('gives nothing for no dates', () => {
    expect(nearestDueByPet([], TODAY)).toEqual({})
  })
})

describe('the pet form’s notes (spec §4)', () => {
  const course = (source: 'record' | 'form', dosage: string | null) => ({ source, dosage })

  it('says nothing while the record holds no more than the form', () => {
    // The form's own weight, undated, and a medicine that is only a name from the form.
    expect(petFormHints({ weights: [weight('w1', null, 28, 'form')], events: [], medications: [course('form', null)] })).toEqual({
      weight: false,
      vaccinations: 0,
      medications: false,
    })
  })

  it('points to the record once it has a history, done vaccinations or a course with details', () => {
    const done = event({ id: 'v1', kind: 'vaccination', status: 'done', date: '2026-03-12', items: [item('i1', ['rabies'])] })
    const planned = event({ id: 'v2', kind: 'vaccination', status: 'planned', date: '2027-03-12', items: [item('i2', ['rabies'])] })
    const treatment = event({ id: 'p1', kind: 'parasite', status: 'done', date: '2026-08-01', items: [item('i3', ['fleas'])] })
    expect(
      petFormHints({
        weights: [weight('w1', '2026-09-01', 4.2)],
        events: [done, planned, treatment],
        medications: [course('form', '1 таблетка')],
      }),
    ).toEqual({ weight: true, vaccinations: 1, medications: true })
    expect(petFormHints({ weights: [], events: [], medications: [course('record', null)] }).medications).toBe(true)
  })
})
