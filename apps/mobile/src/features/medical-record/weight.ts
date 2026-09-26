import type { WeightMeasurement, WeightPatch } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { weightTrend as trendOf } from '@lapka/shared'

/**
 * Weight history, worked out for the screen: reading what was typed and the
 * trend line in the app's words. The period filter, the trend's numbers and
 * the chart's geometry are shared with the site (@lapka/shared:
 * `weightsInPeriod`, `weightTrend`, `chartLayout`, `chartTicks`). No React
 * here, so all of it runs in the unit tests (MR-02.1, MR-02.4).
 */

export const WEIGHT_MIN_KG = 0.1
export const WEIGHT_MAX_KG = 200

export type Parsed<T> = { ok: true; value: T } | { ok: false }

/** «4,2» and «4.2» are the same weight; one decimal, 0.1–200. */
export function parseWeight(text: string): Parsed<number> {
  const normalised = text.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d)?$/.test(normalised)) return { ok: false }

  const value = Number(normalised)
  if (value < WEIGHT_MIN_KG || value > WEIGHT_MAX_KG) return { ok: false }
  return { ok: true, value }
}

/**
 * A correction carries only what the owner changed. `day` null keeps an
 * undated weight undated: opening it to fix the value must not quietly give
 * it today's date. Null when nothing changed.
 */
export function weightPatch(editing: WeightMeasurement, weight: number, day: string | null): WeightPatch | null {
  const patch: WeightPatch = {}
  if (weight !== editing.weight_kg) patch.weight_kg = weight
  if (day !== null && day !== editing.measured_on) patch.measured_on = day
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * «−0,3 кг за 6 месяцев»: the latest weight against the earliest one of the
 * past year. Neutral on purpose — losing weight is sometimes the goal and
 * sometimes the symptom, and the record cannot tell which.
 */
export function weightTrend(t: Dictionary, weights: readonly WeightMeasurement[], today: string): string | null {
  const trend = trendOf(weights, today)
  if (!trend) return null

  const span = trend.months >= 1 ? t.medicalRecord.months(trend.months) : t.medicalRecord.days(trend.days)
  if (trend.change === 0) return t.medicalRecord.noChange(span)

  return t.medicalRecord.trend(`${trend.change < 0 ? '−' : '+'}${t.decimal(Math.abs(trend.change))}`, span)
}
