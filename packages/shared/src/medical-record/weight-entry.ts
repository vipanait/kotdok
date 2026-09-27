import {
  CalendarDateSchema,
  WEIGHT_MAX_KG,
  WeightInputSchema,
  type WeightInput,
  type WeightMeasurement,
  type WeightPatch,
} from '@lapka/contracts'

/**
 * Reading a weighing the owner typed, the same on the phone and the site.
 *
 * The bounds are the contract's (`WeightInputSchema`: above zero, at most
 * `WEIGHT_MAX_KG`); the form adds only what spec §7.13 asks of the field —
 * one decimal place — so the smallest weight it takes is 0.1 kg. A value
 * that passes here is one the API accepts: it is checked against the
 * contract's own schema, not against a copy of its numbers.
 */

/** Digits after the decimal separator the field takes (spec §7.13). */
export const WEIGHT_DECIMALS = 1

/** The lightest weight the field takes: one step of its last decimal, since zero is refused. */
export const WEIGHT_MIN_KG = 1 / 10 ** WEIGHT_DECIMALS

export type WeightTextProblem = 'empty' | 'invalid'

export type ParsedWeight = { ok: true; value: number } | { ok: false; problem: WeightTextProblem }

const WEIGHT_TEXT = new RegExp(`^\\d{1,3}(?:[.,]\\d{1,${WEIGHT_DECIMALS}})?$`)

/**
 * «4,2» and «4.2» are the same 4.2 kg. The text is read as written — the
 * comma becomes a point and `Number` reads the decimal literal — so the
 * number sent is exactly the one the owner typed, not a rounded float.
 */
export function parseWeight(text: string): ParsedWeight {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, problem: 'empty' }
  if (!WEIGHT_TEXT.test(trimmed)) return { ok: false, problem: 'invalid' }

  const value = Number(trimmed.replace(',', '.'))
  if (!WeightInputSchema.shape.weight_kg.safeParse(value).success) return { ok: false, problem: 'invalid' }
  return { ok: true, value }
}

/**
 * The weight field of a form that opened with a value already stored: text
 * that still says that value is that value, even with more decimals than a
 * typed weight may have. The pet form keeps 4.25 kg; dating it («Уточнить»)
 * or moving its measurement to another day must not round it to 4.3 or be
 * refused for its second decimal — the owner did not type it. Anything else
 * is read as typed (`parseWeight`). `kept` null: nothing was stored.
 */
export function parseWeightKeeping(text: string, kept: number | null): ParsedWeight {
  if (kept !== null) {
    const written = text.trim().replace(',', '.')
    if (/^\d{1,3}(?:\.\d+)?$/.test(written) && Number(written) === kept) return { ok: true, value: kept }
  }
  return parseWeight(text)
}

export type WeightDayProblem = 'empty' | 'invalid' | 'future'

/**
 * A weighing's day: a calendar day no later than the owner's today — a
 * weighing cannot have happened tomorrow. `today` is the owner's own day
 * (`localToday`), not UTC's.
 */
export function weightDayProblem(day: string, today: string): WeightDayProblem | null {
  if (day.trim() === '') return 'empty'
  if (!CalendarDateSchema.safeParse(day).success) return 'invalid'
  return day > today ? 'future' : null
}

export type WeightFormProblems = { weight?: WeightTextProblem; day?: WeightDayProblem }

/**
 * A new weighing from the form's two fields: the request body, or what is
 * wrong with each field. The body is the contract's own parse of the values.
 * `kept`: the stored weight the form opened with (dating the pet form's
 * weight), taken as it is while the field still says it.
 */
export function newWeightInput(
  weightText: string,
  day: string,
  today: string,
  kept: number | null = null,
): { ok: true; input: WeightInput } | { ok: false; problems: WeightFormProblems } {
  const weight = parseWeightKeeping(weightText, kept)
  const dayProblem = weightDayProblem(day, today)
  if (!weight.ok || dayProblem) {
    return { ok: false, problems: { weight: weight.ok ? undefined : weight.problem, day: dayProblem ?? undefined } }
  }
  return { ok: true, input: WeightInputSchema.parse({ measured_on: day, weight_kg: weight.value }) }
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
 * A correction from the form's two fields. The day may stay empty only for
 * the form's undated weight (it keeps having no date); a dated measurement
 * never loses its day. `patch` null: nothing changed, there is nothing to send.
 */
export function weightCorrection(
  editing: WeightMeasurement,
  weightText: string,
  day: string,
  today: string,
): { ok: true; patch: WeightPatch | null } | { ok: false; problems: WeightFormProblems } {
  // Its own value, unchanged, is kept exactly — a pet-form weight of 4.25 can be dated.
  const weight = parseWeightKeeping(weightText, editing.weight_kg)
  const keepUndated = editing.measured_on === null && day.trim() === ''
  const dayProblem = keepUndated ? null : weightDayProblem(day, today)
  if (!weight.ok || dayProblem) {
    return { ok: false, problems: { weight: weight.ok ? undefined : weight.problem, day: dayProblem ?? undefined } }
  }
  return { ok: true, patch: weightPatch(editing, weight.value, keepUndated ? null : day) }
}

/** A weight as the field shows it to be edited: «4,2» with a comma, «4.2» with a point. */
export function weightFieldText(kg: number, decimalSeparator: string): string {
  return String(kg).replace('.', decimalSeparator)
}
