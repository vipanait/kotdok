import { describe, expect, it } from 'vitest'
import type { WeightMeasurement } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { chartLayout, weightsInPeriod as pointsInPeriod, type DatedWeight } from '@lapka/shared'
import { parseWeight, weightPatch, weightTrend } from './weight'

function d(measured_on: string, weight_kg: number): DatedWeight {
  return { id: `${measured_on}-${weight_kg}`, measured_on, weight_kg, source: 'record' }
}

function w(measured_on: string | null, weight_kg: number, source: 'record' | 'form' = 'record'): WeightMeasurement {
  return { id: `${measured_on}-${weight_kg}`, measured_on, weight_kg, source }
}

describe('reading a typed weight (MR-02.1)', () => {
  it('reads a comma and a point as the same number', () => {
    expect(parseWeight('4,2')).toEqual({ ok: true, value: 4.2 })
    expect(parseWeight(' 4.2 ')).toEqual({ ok: true, value: 4.2 })
  })

  it('refuses zero, a negative, over 200, text and a second decimal', () => {
    for (const text of ['0', '-1', '200,1', 'abc', '', '4,25', '4..2']) {
      expect(parseWeight(text).ok, text).toBe(false)
    }
    expect(parseWeight('200')).toEqual({ ok: true, value: 200 })
    expect(parseWeight('0,1')).toEqual({ ok: true, value: 0.1 })
  })
})

describe('the chart (MR-02.4)', () => {
  const today = '2026-09-24'
  const three = [w('2026-09-12', 4.2), w('2026-06-20', 4.4), w('2026-03-12', 4.5)]

  it('takes the period’s dated points, oldest first, and leaves the undated one out', () => {
    const points = pointsInPeriod([...three, w(null, 28, 'form')], 'all', today)
    expect(points.map((p) => p.measured_on)).toEqual(['2026-03-12', '2026-06-20', '2026-09-12'])
    expect(pointsInPeriod(three, 'halfYear', today).map((p) => p.measured_on)).toEqual(['2026-06-20', '2026-09-12'])
  })

  it('draws nothing for no points or one', () => {
    expect(chartLayout([], 300, 160)).toBeNull()
    expect(chartLayout([d('2026-09-12', 4.2)], 300, 160)).toBeNull()
  })

  it('places three points inside the box, the axis starting below the minimum', () => {
    const layout = chartLayout(pointsInPeriod(three, 'all', today), 300, 160)!
    expect(layout.points).toHaveLength(3)
    for (const point of layout.points) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(300)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(160)
    }
    expect(layout.min).toBeLessThan(4.2)
    expect(layout.min).toBeGreaterThan(0)
    // Heavier is higher.
    expect(layout.points[0].y).toBeLessThan(layout.points[2].y)
  })

  it('does not divide by zero when every point is the same weight or the same day', () => {
    const flat = chartLayout([d('2026-03-12', 5), d('2026-06-20', 5), d('2026-09-12', 5)], 300, 160)!
    for (const point of flat.points) expect(Number.isFinite(point.y)).toBe(true)
    expect(flat.min).toBeLessThan(5)
    expect(flat.max).toBeGreaterThan(5)
  })
})

describe('the trend', () => {
  const today = '2026-09-24'

  it('says how much and over how long, neutrally', () => {
    expect(weightTrend(ru, [w('2026-09-12', 4.2), w('2026-06-20', 4.4), w('2026-03-12', 4.5)], today)).toBe('−0,3 кг за 6 месяцев')
    expect(weightTrend(en, [w('2026-09-12', 4.7), w('2026-03-12', 4.5)], today)).toBe('+0.2 kg in 6 months')
  })

  it('is absent with fewer than two dated points in the last year', () => {
    expect(weightTrend(ru, [w('2026-09-12', 4.2), w(null, 5, 'form')], today)).toBeNull()
    expect(weightTrend(ru, [w('2026-09-12', 4.2), w('2024-01-01', 5)], today)).toBeNull()
  })

  it('says "no change" rather than "+0"', () => {
    expect(weightTrend(ru, [w('2026-09-12', 4.2), w('2026-08-12', 4.2)], today)).toBe('Без изменений за 1 месяц')
  })
})

describe('what a correction sends (review I4)', () => {
  const dated = { id: 'a', measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' as const }
  const undated = { id: 'u', measured_on: null, weight_kg: 28, source: 'form' as const }

  it('sends only what changed', () => {
    expect(weightPatch(dated, 4.3, '2026-09-12')).toEqual({ weight_kg: 4.3 })
    expect(weightPatch(dated, 4.2, '2026-09-10')).toEqual({ measured_on: '2026-09-10' })
    expect(weightPatch(dated, 4.2, '2026-09-12')).toBeNull()
  })

  it('leaves an undated weight undated unless the owner gives it a day', () => {
    expect(weightPatch(undated, 27, null)).toEqual({ weight_kg: 27 })
    expect(weightPatch(undated, 28, '2026-01-10')).toEqual({ measured_on: '2026-01-10' })
  })
})

describe('a chart of points on one day', () => {
  it('spreads them evenly rather than dividing by a zero span', () => {
    const layout = chartLayout([d('2026-09-12', 4), { ...d('2026-09-12', 5), id: 'b' }], 300, 160)!
    expect(layout.points.map((p) => p.x)).toEqual([0, 300])
  })
})
