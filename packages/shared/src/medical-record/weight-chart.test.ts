import { describe, expect, it } from 'vitest'
import { chartLayout, chartTicks, chartY } from './weight-chart'
import type { DatedWeight } from './record-overview'

const d = (measured_on: string, weight_kg: number): DatedWeight => ({ id: measured_on, measured_on, weight_kg, source: 'record' })

describe('weight chart', () => {
  it('starts the axis 10% below the lightest weight (spec §7.8)', () => {
    const layout = chartLayout([d('2026-03-12', 4.5), d('2026-09-12', 4.2)], 300, 150)!
    expect(layout.min).toBeCloseTo(3.78, 9)
    expect(layout.max).toBeCloseTo(4.572, 9)
    expect(chartLayout([d('2026-03-12', 4.5)], 300, 150)).toBeNull()
  })

  it('picks two to four round guide weights inside the axis', () => {
    expect(chartTicks(3.78, 4.572)).toEqual([3.8, 4, 4.2, 4.4])
    expect(chartTicks(25.2, 30.48)).toEqual([26, 28, 30])
    expect(chartTicks(4.5, 5.05)).toEqual([4.6, 4.8, 5])
    for (const [min, max] of [[0.9, 1.11], [45, 55.5], [150, 201]]) {
      const ticks = chartTicks(min, max)
      expect(ticks.length).toBeGreaterThanOrEqual(2)
      expect(ticks.length).toBeLessThanOrEqual(4)
      for (const tick of ticks) {
        expect(tick).toBeGreaterThanOrEqual(min)
        expect(tick).toBeLessThanOrEqual(max)
        expect(Math.round(tick * 10) / 10).toBe(tick)
      }
    }
  })

  it('puts a point exactly on the guide of its weight', () => {
    const layout = chartLayout([d('2026-03-12', 4.5), d('2026-06-20', 4.4), d('2026-09-12', 4.2)], 300, 150)!
    const point = layout.points[1]
    expect(chartTicks(layout.min, layout.max)).toContain(4.4)
    expect(chartY(layout, 4.4, 150)).toBeCloseTo(point.y, 9)
  })
})
