import type { AdminMetric, AdminRatio, AdminRatioPart } from '@/shared/types/admin'

/**
 * How a number moved against the previous period of the same length.
 * Counts move in percent (or in pieces, where a percent of a handful lies),
 * shares in percentage points. A change that rounds to zero is flat.
 */
export type AdminChange =
  | { kind: 'up' | 'down' | 'flat'; value: number; unit: 'percent' | 'points' | 'count' }
  | { kind: 'new' }
  | { kind: 'nodata' }

function signed(delta: number, unit: 'percent' | 'points' | 'count'): AdminChange {
  const value = Math.round(Math.abs(delta))
  if (value === 0) return { kind: 'flat', value: 0, unit }
  return { kind: delta > 0 ? 'up' : 'down', value, unit }
}

export function metricChange(metric: AdminMetric, unit: 'percent' | 'count' = 'percent'): AdminChange {
  if (metric.prev === null) return { kind: 'nodata' }
  if (unit === 'count') return signed(metric.cur - metric.prev, 'count')
  if (metric.prev === 0) return metric.cur === 0 ? { kind: 'flat', value: 0, unit } : { kind: 'new' }
  return signed(((metric.cur - metric.prev) / metric.prev) * 100, 'percent')
}

export function ratioValue(part: AdminRatioPart): number | null {
  return part.den === 0 ? null : part.num / part.den
}

export function ratioChange(ratio: AdminRatio): AdminChange {
  const cur = ratioValue(ratio.cur)
  const prev = ratio.prev ? ratioValue(ratio.prev) : null
  if (cur === null || prev === null) return { kind: 'nodata' }
  return signed((cur - prev) * 100, 'points')
}
