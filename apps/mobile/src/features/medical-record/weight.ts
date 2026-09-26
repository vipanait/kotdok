import type { WeightMeasurement } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { weightTrend as trendOf } from '@lapka/shared'

/**
 * Weight history, worked out for the screen: reading what was typed and the
 * trend line in the app's words. Reading the fields, the period filter, the
 * trend's numbers and the chart's geometry are shared with the site
 * (@lapka/shared: `parseWeight`, `weightPatch`, `weightsInPeriod`,
 * `weightTrend`, `chartLayout`, `chartTicks`). No React
 * here, so all of it runs in the unit tests (MR-02.1, MR-02.4).
 */

// Reading the sheet's fields is shared with the site: the contract's bounds,
// one decimal, a comma or a point.
export { parseWeight, weightPatch } from '@lapka/shared'

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
