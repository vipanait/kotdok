import { describe, expect, it } from 'vitest'
import { metricChange, ratioChange, ratioValue } from '@/features/admin/change'

describe('change against the previous period', () => {
  it('shows growth and decline of a count in whole percent', () => {
    expect(metricChange({ cur: 118, prev: 100 })).toEqual({ kind: 'up', value: 18, unit: 'percent' })
    expect(metricChange({ cur: 96, prev: 100 })).toEqual({ kind: 'down', value: 4, unit: 'percent' })
  })

  it('calls a change that rounds to zero flat', () => {
    expect(metricChange({ cur: 100, prev: 100 })).toMatchObject({ kind: 'flat' })
    expect(metricChange({ cur: 1001, prev: 1000 })).toMatchObject({ kind: 'flat' })
    expect(metricChange({ cur: 0, prev: 0 })).toMatchObject({ kind: 'flat' })
  })

  it('calls something from nothing new, and a missing source no data', () => {
    expect(metricChange({ cur: 5, prev: 0 })).toEqual({ kind: 'new' })
    expect(metricChange({ cur: 5, prev: null })).toEqual({ kind: 'nodata' })
  })

  it('can show the difference in pieces', () => {
    expect(metricChange({ cur: 23, prev: 14 }, 'count')).toEqual({ kind: 'up', value: 9, unit: 'count' })
    expect(metricChange({ cur: 3, prev: 0 }, 'count')).toEqual({ kind: 'up', value: 3, unit: 'count' })
  })

  it('shows a share in percentage points', () => {
    expect(ratioChange({ cur: { num: 82, den: 100 }, prev: { num: 79, den: 100 } })).toEqual({ kind: 'up', value: 3, unit: 'points' })
    expect(ratioChange({ cur: { num: 1, den: 2 }, prev: { num: 3, den: 4 } })).toEqual({ kind: 'down', value: 25, unit: 'points' })
  })

  it('has no change for a share with nothing to divide', () => {
    expect(ratioChange({ cur: { num: 0, den: 0 }, prev: { num: 1, den: 2 } })).toEqual({ kind: 'nodata' })
    expect(ratioChange({ cur: { num: 1, den: 2 }, prev: { num: 0, den: 0 } })).toEqual({ kind: 'nodata' })
    expect(ratioChange({ cur: { num: 1, den: 2 }, prev: null })).toEqual({ kind: 'nodata' })
  })

  it('reads a share as a fraction, or null without a denominator', () => {
    expect(ratioValue({ num: 1, den: 4 })).toBe(0.25)
    expect(ratioValue({ num: 0, den: 0 })).toBeNull()
  })
})
