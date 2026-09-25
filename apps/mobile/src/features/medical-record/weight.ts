import type { WeightMeasurement } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { addMonths, daysBetween, monthsBetween } from '@/lib/calendar-day'

/**
 * Weight history, worked out for the screen: reading what was typed, the
 * chart's geometry and the trend line. No React here, so all of it runs in
 * the unit tests (MR-02.1, MR-02.4).
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

export type Period = 'halfYear' | 'year' | 'all'

export type DatedWeight = WeightMeasurement & { measured_on: string }

const isDated = (weight: WeightMeasurement): weight is DatedWeight => weight.measured_on !== null

/** The period's dated measurements, oldest first: the undated one has no place on a time axis. */
export function pointsInPeriod(weights: readonly WeightMeasurement[], period: Period, today: string): DatedWeight[] {
  const since = period === 'all' ? '' : addMonths(today, period === 'halfYear' ? -6 : -12)
  return weights
    .filter(isDated)
    .filter((weight) => weight.measured_on >= since)
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
}

export type ChartLayout = {
  points: Array<{ x: number; y: number; value: number; measured_on: string }>
  /** The axis, not the data: it starts 10% below the lightest weight (spec §7.8). */
  min: number
  max: number
}

/**
 * Where each point goes in a `width` × `height` box; null below two points,
 * where a line says nothing (the screen explains instead).
 *
 * Starting the axis at zero would flatten a 0.3 kg change into nothing. The
 * lightest weight is always above zero, so the axis always has a height and
 * nothing here divides by zero — even when every point is the same.
 */
export function chartLayout(points: readonly DatedWeight[], width: number, height: number): ChartLayout | null {
  if (points.length < 2) return null

  const values = points.map((point) => point.weight_kg)
  const min = Math.min(...values) * 0.9
  const top = Math.max(...values)
  const max = top + (top - min) * 0.1

  const first = Date.parse(`${points[0].measured_on}T00:00:00Z`)
  const span = Date.parse(`${points[points.length - 1].measured_on}T00:00:00Z`) - first

  return {
    min,
    max,
    points: points.map((point, index) => ({
      x: span > 0
        ? ((Date.parse(`${point.measured_on}T00:00:00Z`) - first) / span) * width
        : (index / (points.length - 1)) * width,
      y: height - ((point.weight_kg - min) / (max - min)) * height,
      value: point.weight_kg,
      measured_on: point.measured_on,
    })),
  }
}

/**
 * «−0,3 кг за 6 месяцев»: the latest weight against the earliest one of the
 * past year. Neutral on purpose — losing weight is sometimes the goal and
 * sometimes the symptom, and the record cannot tell which.
 */
export function weightTrend(t: Dictionary, weights: readonly WeightMeasurement[], today: string): string | null {
  const year = pointsInPeriod(weights, 'year', today)
  if (year.length < 2) return null

  const first = year[0]
  const last = year[year.length - 1]
  const months = monthsBetween(first.measured_on, last.measured_on)
  const span = months >= 1 ? t.medicalRecord.months(months) : t.medicalRecord.days(daysBetween(first.measured_on, last.measured_on))

  const change = Math.round((last.weight_kg - first.weight_kg) * 10) / 10
  if (change === 0) return t.medicalRecord.noChange(span)

  return t.medicalRecord.trend(`${change < 0 ? '−' : '+'}${t.decimal(Math.abs(change))}`, span)
}
