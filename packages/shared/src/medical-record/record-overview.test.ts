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
  parasiteGroups,
  splitCourses,
  weightTrend,
  weightsOfYear,
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

  it('says nothing about one point or the undated form value', () => {
    expect(weightTrend([weight('a', null, 28, 'form')], TODAY)).toBeNull()
    expect(weightTrend([weight('a', null, 28, 'form'), weight('b', '2026-09-01', 27)], TODAY)).toBeNull()
  })

  it('leaves out measurements older than a year', () => {
    expect(weightsOfYear([weight('a', '2025-01-01', 4), weight('b', '2026-01-01', 4.1)], TODAY).map((w) => w.id)).toEqual(['b'])
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
