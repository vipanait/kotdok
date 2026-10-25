import type { WeightMeasurement } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { apiFailure, weightTrend as trendOf } from '@lapka/shared'

/**
 * Weight history, worked out for the screen: reading what was typed and the
 * trend line in the app's words. Reading the fields, the period filter, the
 * trend's numbers and the chart's geometry are shared with the site
 * (@lapka/shared: `parseWeight`, `weightPatch`, `weightsInPeriod`,
 * `weightTrend`, `chartLayout`, `chartTicks`). No React
 * here, so all of it runs in the unit tests (MR-02.1, MR-02.4).
 */

// Reading the sheet's fields is shared with the site: the contract's bounds,
// one decimal, a comma or a point — and a stored value left as it opened is
// kept exactly (a pet-form weight of 4,25 kg can be dated, MW-09).
export { parseWeight, parseWeightKeeping, weightPatch } from '@lapka/shared'
import { parseWeightGrams, parseWeightKeeping as keepingKg, weightUnitFor, type ParsedWeight } from '@lapka/shared'

export type WeightUnit = 'kg' | 'g'

/**
 * A weighing as typed in its unit (FB-2/05): grams for a newborn, kilograms
 * otherwise. A stored weight sent back unchanged is taken as stored.
 */
export function readWeight(text: string, unit: WeightUnit, kept: number | null): ParsedWeight {
  if (unit === 'kg') return keepingKg(text, kept)
  if (kept !== null && text.trim() === String(Math.round(kept * 1000))) return { ok: true, value: kept }
  return parseWeightGrams(text)
}

/** A stored weight as its field opens: under a kilogram in grams. */
export function weightInput(t: Dictionary, kg: number): { unit: WeightUnit; text: string } {
  return weightUnitFor(kg) === 'g' ? { unit: 'g', text: String(Math.round(kg * 1000)) } : { unit: 'kg', text: t.decimal(kg) }
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

/**
 * What a failed weight save means for the sheet. `landed`: the server says
 * this save's key was used — an earlier try did reach it, with the values it
 * had then, so the list behind the sheet is out of date and closing the sheet
 * reloads it (MW-09 final review). `dayTaken`: that day has a measurement.
 * `failed`: anything else, said by `describeFailure`.
 */
export function weightSaveFailure(cause: unknown): 'landed' | 'dayTaken' | 'failed' {
  const failure = apiFailure(cause)
  // Any other 409 of a weight is its day already taken.
  return failure === 'keyReused' ? 'landed' : failure === 'conflict' ? 'dayTaken' : 'failed'
}
