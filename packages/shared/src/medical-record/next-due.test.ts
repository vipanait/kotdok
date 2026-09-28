import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HealthEvent, HealthItem } from '@lapka/contracts'
import { addInterval } from './catalog-search'
import { nextDayMin, nextDayProblem, suggestNextDay } from './event-entry'
import { addMonths, localToday, parasiteCovers } from './record-overview'

// MW-04 criterion 2: the next due date after «Сделано» follows the unit of the
// interval, on the calendar, whatever the clock and the zone. One place for
// this arithmetic — the site and the phone both call it.

describe('the next date after «Сделано»', () => {
  it('24.09.2026 + 12 weeks is 17.12.2026, not + 3 months', () => {
    expect(suggestNextDay('2026-09-24', { value: 12, unit: 'week' }, '2026-09-26')).toBe('2026-12-17')
    expect(suggestNextDay('2026-09-24', { value: 3, unit: 'month' }, '2026-09-26')).toBe('2026-12-24')
  })

  it('counts calendar months: a shorter month ends the month, a leap day a year on is the 28th', () => {
    expect(addInterval('2026-01-31', { value: 1, unit: 'month' })).toBe('2026-02-28')
    expect(addInterval('2028-01-31', { value: 1, unit: 'month' })).toBe('2028-02-29')
    expect(addInterval('2026-10-31', { value: 1, unit: 'month' })).toBe('2026-11-30')
    expect(addInterval('2026-11-30', { value: 3, unit: 'month' })).toBe('2027-02-28')
    expect(addInterval('2028-02-29', { value: 1, unit: 'year' })).toBe('2029-02-28')
    // One rule for months, the due dates' own.
    expect(addInterval('2026-08-31', { value: 6, unit: 'month' })).toBe(addMonths('2026-08-31', 6))
  })

  it('crosses the end of a year and a daylight-saving change by whole days', () => {
    expect(addInterval('2026-12-10', { value: 4, unit: 'week' })).toBe('2027-01-07')
    // 29 March 2026: Europe moves its clocks; 25 October: back.
    expect(addInterval('2026-03-20', { value: 2, unit: 'week' })).toBe('2026-04-03')
    expect(addInterval('2026-10-20', { value: 1, unit: 'week' })).toBe('2026-10-27')
  })

  it('suggests nothing without an interval, or when the date would already be past', () => {
    expect(suggestNextDay('2026-09-24', null, '2026-09-26')).toBeNull()
    expect(suggestNextDay('2026-01-10', { value: 4, unit: 'week' }, '2026-09-26')).toBeNull()
  })
})

describe('the earliest next date a picker offers', () => {
  it('is the day after the record’s day, never before today, and always one the rules accept', () => {
    expect(nextDayMin('2026-09-26', '2026-09-26')).toBe('2026-09-27')
    expect(nextDayMin('2026-09-24', '2026-09-26')).toBe('2026-09-26')
    expect(nextDayMin('2026-12-31', '2026-09-26')).toBe('2027-01-01')
    expect(nextDayMin('', '2026-09-26')).toBe('2026-09-26')
    expect(nextDayMin(null, '2026-09-26')).toBe('2026-09-26')
    for (const [record, today] of [['2026-09-26', '2026-09-26'], ['2026-09-24', '2026-09-26'], ['2026-02-28', '2026-02-28']]) {
      expect(nextDayProblem(nextDayMin(record, today), record, today)).toBeNull()
    }
  })
})

describe('the day boundary and the time zone', () => {
  // TZ stands in for the owner's device zone (Node reads it again when it changes).
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('«today» is the owner’s calendar day: a minute after midnight is the new day, a minute before is not', () => {
    vi.stubEnv('TZ', 'Europe/Moscow')
    expect(localToday(new Date(2026, 8, 24, 0, 1))).toBe('2026-09-24')
    expect(localToday(new Date(2026, 8, 23, 23, 59))).toBe('2026-09-23')
  })

  it('one moment is a different «today» in Moscow and in Los Angeles; the interval does not care', () => {
    // 22:30 UTC on 26 September: already the 27th in Moscow, still the 26th in Los Angeles.
    const moment = new Date(Date.UTC(2026, 8, 26, 22, 30))
    vi.stubEnv('TZ', 'Europe/Moscow')
    const moscow = localToday(moment)
    const moscowNext = addInterval('2026-09-24', { value: 12, unit: 'week' })
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const losAngeles = localToday(moment)
    const losAngelesNext = addInterval('2026-09-24', { value: 12, unit: 'week' })
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const kiritimatiNext = addInterval('2026-09-24', { value: 12, unit: 'week' })

    expect(moscow).toBe('2026-09-27')
    expect(losAngeles).toBe('2026-09-26')
    expect(new Set([moscowNext, losAngelesNext, kiritimatiNext])).toEqual(new Set(['2026-12-17']))
  })
})

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const item = (n: number, targets: string[], name: string | null): HealthItem => ({
  id: uuid(n),
  name,
  targets,
  source_item_id: null,
  product_id: null,
  interval: null,
  instructions: null,
  medication_id: null,
})
function treatment(n: number, status: HealthEvent['status'], date: string, items: HealthItem[]): HealthEvent {
  return { id: uuid(n), kind: 'parasite', status, date, clinic: null, notes: null, items, visit_kind: null, reason: null, diagnosis: null, check_id: null }
}

describe('the parasite cards (web v1 «parasites», phone «Паразиты»)', () => {
  it('shows the latest done treatment and the earliest plan per card', () => {
    const june = treatment(1, 'done', '2026-06-20', [item(11, ['fleas', 'ticks'], 'Бравекто Спот-он')])
    const july = treatment(2, 'done', '2026-07-05', [item(12, ['worms'], 'Мильбемакс')])
    const september = treatment(3, 'planned', '2026-09-12', [item(13, ['fleas', 'ticks'], 'Бравекто Спот-он')])
    const october = treatment(4, 'planned', '2026-10-05', [item(14, ['worms'], 'Мильбемакс')])
    const december = treatment(5, 'planned', '2026-12-17', [item(15, ['fleas'], 'Бравекто Спот-он')])
    const [fleasTicks, worms] = parasiteCovers([december, october, september, july, june])
    expect([fleasTicks.cover, fleasTicks.last?.event.id, fleasTicks.next?.item.id]).toEqual(['fleasTicks', uuid(1), uuid(13)])
    expect([worms.cover, worms.last?.item.name, worms.next?.event.date]).toEqual(['worms', 'Мильбемакс', '2026-10-05'])
  })

  it('counts a combined product on both cards, and a group with nothing has nothing', () => {
    const combined = treatment(1, 'done', '2026-07-05', [item(11, ['fleas', 'ticks', 'worms'], 'Инспектор')])
    expect(parasiteCovers([combined]).map((card) => card.last?.item.id)).toEqual([uuid(11), uuid(11)])
    const wormsOnly = treatment(2, 'done', '2026-07-05', [item(12, ['worms'], null)])
    expect(parasiteCovers([wormsOnly]).map((card) => [card.last?.item.id ?? null, card.next])).toEqual([
      [null, null],
      [uuid(12), null],
    ])
  })
})
