import type { HealthOverview } from '@lapka/contracts'
import { datedWeights, weightTrend, weightsInPeriod, type WeightPeriod } from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { medicalRecordHref } from '../stage'
import { formatDay, formatDecimal, formatWeight, recordDay, trendText, type WeightPoint } from '../view-model'

/**
 * The weight page (web v1, «weight» and «weight-one»), worked out from the
 * overview: the period's chart or what stands in for it, and every
 * measurement as a row of text. No React, so the rules are unit tested:
 * the period really filters the chart, one point or none is said in words,
 * and every value and date can be read without the chart.
 */

export const WEIGHT_PERIODS: readonly WeightPeriod[] = ['halfYear', 'year', 'all']

export type WeightSummary =
  /** Two or more points in the period: a chart, its trend, and the points as text. */
  | { kind: 'chart'; current: string; trend: string | null; points: WeightPoint[]; label: string }
  /** A current weight, but fewer than two points in the period: said in words. */
  | { kind: 'text'; current: string; text: string }
  /** No weight at all, in the history or the form. */
  | { kind: 'none'; title: string; body: string }

export type WeightRowAction = { href: string; label: string; ariaLabel: string }

export type WeightRow = {
  key: string
  /** «12 сентября 2026», or «Дата не указана» for the form's old value. */
  day: string
  /** «из анкеты» when the value came from the pet form. */
  note: string | null
  value: string
  action: WeightRowAction | null
}

export type WeightPageView = { subtitle: string; summary: WeightSummary; rows: WeightRow[] }

function summary(
  dict: Dictionary,
  locale: Locale,
  overview: HealthOverview,
  period: WeightPeriod,
  today: string,
): WeightSummary {
  const words = dict.medicalRecord
  const page = words.weightPage
  const current = overview.pet.weight_kg
  if (current === null) return { kind: 'none', title: page.noneTitle, body: page.noneBody }

  const shown = formatWeight(words, current)
  const span = page.periodSpan[period]
  const points = weightsInPeriod(overview.weights, period, today)
  if (points.length >= 2) {
    const trend = weightTrend(overview.weights, today, period)
    return {
      kind: 'chart',
      current: shown,
      trend: trend ? trendText(dict, locale, trend) : null,
      points: points.map((weight) => ({
        key: weight.id,
        day: weight.measured_on,
        value: weight.weight_kg,
        label: formatWeight(words, weight.weight_kg),
        dayLabel: recordDay(words, weight.measured_on, today),
      })),
      label: page.chartLabel
        .replace('{span}', span)
        .replace('{from}', formatDecimal(words, points[0].weight_kg))
        .replace('{to}', formatDecimal(words, points[points.length - 1].weight_kg)),
    }
  }

  // Fewer than two points: no line, which would say nothing, but a sentence that does.
  const dated = datedWeights(overview.weights)
  const latest = dated[dated.length - 1]
  if (points.length === 1 && dated.length > 1) {
    return {
      kind: 'text',
      current: shown,
      text: page.onePointIn.replace('{span}', span).replace('{day}', formatDay(words, points[0].measured_on, true)),
    }
  }
  if (points.length === 0 && latest) {
    return {
      kind: 'text',
      current: shown,
      text: page.emptyPeriod.replace('{span}', span).replace('{day}', formatDay(words, latest.measured_on, true)),
    }
  }
  // One measurement in all, or only the form's undated value.
  return { kind: 'text', current: shown, text: page.onePoint }
}

function rows(dict: Dictionary, overview: HealthOverview, petId: string, editable: boolean): WeightRow[] {
  const words = dict.medicalRecord
  const page = words.weightPage
  const { pet, weights } = overview

  // A form weight with no history behind it (a pet from before the record)
  // is still the pet's weight: listed, and «Уточнить» adds the dated
  // measurement — the form's value stays in the history as the server keeps it.
  if (weights.length === 0) {
    if (pet.weight_kg === null) return []
    const value = formatWeight(words, pet.weight_kg)
    return [
      {
        key: 'form',
        day: page.noDate,
        note: page.fromForm,
        value,
        action: editable
          ? {
              href: medicalRecordHref.newRecord(petId, 'weight'),
              label: page.clarify,
              ariaLabel: page.clarifyLabel.replace('{weight}', value),
            }
          : null,
      },
    ]
  }

  // Newest first, the undated one last: the server's order.
  return weights.map((weight) => {
    const value = formatWeight(words, weight.weight_kg)
    const day = weight.measured_on ? formatDay(words, weight.measured_on, true) : page.noDate
    const undated = weight.measured_on === null
    return {
      key: weight.id,
      day,
      note: weight.source === 'form' ? page.fromForm : null,
      value,
      action: editable
        ? {
            href: medicalRecordHref.recordEdit(petId, weight.id),
            label: undated ? page.clarify : page.edit,
            ariaLabel: undated
              ? page.clarifyLabel.replace('{weight}', value)
              : page.editLabel.replace('{weight}', value).replace('{day}', day),
          }
        : null,
    }
  })
}

/**
 * Everything the weight page shows for one period. `editable` is whether
 * this site may change weights (the stage flag and the server's `writable`);
 * without it the rows are read-only text.
 */
export function weightPage(
  dict: Dictionary,
  locale: Locale,
  overview: HealthOverview,
  period: WeightPeriod,
  today: string,
  editable: boolean,
): WeightPageView {
  const page = dict.medicalRecord.weightPage
  const onlyForm = datedWeights(overview.weights).length === 0 && overview.pet.weight_kg !== null
  return {
    subtitle: (onlyForm ? page.subtitleForm : page.subtitle).replace('{name}', overview.pet.name),
    summary: summary(dict, locale, overview, period, today),
    rows: rows(dict, overview, overview.pet.id, editable),
  }
}

/** `?saved=` after a save: which confirmation the page shows once. */
export type WeightSaved = 'added' | 'changed' | 'deleted'

export function parseWeightSaved(value: string | string[] | undefined): WeightSaved | null {
  return value === 'added' || value === 'changed' || value === 'deleted' ? value : null
}
