/**
 * The quick-assessment answers of a stored check, as lines to read back.
 *
 * They are not columns of the record: the server keeps them inside
 * `full_response`, whose shape the contract leaves open because it has changed
 * between versions. So nothing here trusts it — a value this app has no word
 * for is left out rather than shown raw.
 */

import {
  ACTIVITY_VALUES,
  APPETITE_VALUES,
  DURATION_VALUES,
  PAIN_SIGNS,
  STOOL_VALUES,
} from '@lapka/contracts'
import type { Dictionary } from '@/i18n'

export type AnswerLine = { label: string; value: string }

function oneOf<Value extends string>(
  allowed: readonly Value[],
  value: unknown,
): Value | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as Value)
    : null
}

/**
 * What the analysis saw in the photos, when there were any.
 *
 * The model fills `photo_observations` in whether or not it was shown a
 * picture, so the count decides: without a photo the sentence can only be a
 * guess dressed as an observation. `has_photo` is how older checks from the
 * site recorded the same thing.
 */
export function photoObservations(full: Record<string, unknown> | null): string | null {
  if (!full) return null
  const hadPhotos =
    (typeof full.photo_count === 'number' && full.photo_count > 0) || full.has_photo === true
  const text = typeof full.photo_observations === 'string' ? full.photo_observations.trim() : ''
  return hadPhotos && text ? text : null
}

/** @returns only the questions that were answered, in the order the form asks them. */
export function checkAnswers(
  t: Dictionary,
  full: Record<string, unknown> | null,
): AnswerLine[] {
  if (!full) return []

  const lines: AnswerLine[] = []

  const appetite = oneOf(APPETITE_VALUES, full.appetite)
  if (appetite) lines.push({ label: t.check.appetite, value: t.appetite[appetite] })

  const activity = oneOf(ACTIVITY_VALUES, full.activity)
  if (activity) lines.push({ label: t.check.activity, value: t.activity[activity] })

  const duration = oneOf(DURATION_VALUES, full.duration)
  if (duration) lines.push({ label: t.check.duration, value: t.duration[duration] })

  const stool = oneOf(STOOL_VALUES, full.stool)
  if (stool) lines.push({ label: t.check.stool, value: t.stool[stool] })

  const signs = Array.isArray(full.pain_signs)
    ? full.pain_signs
        .map((sign) => oneOf(PAIN_SIGNS, sign))
        .filter((sign): sign is (typeof PAIN_SIGNS)[number] => sign !== null)
    : []
  if (signs.length > 0) {
    lines.push({ label: t.check.painSigns, value: signs.map((sign) => t.pain[sign]).join(', ') })
  }

  return lines
}

/**
 * «17 сентября 2026, 20:54» in the language given.
 *
 * With the time: two checks on the same day otherwise look identical, and the
 * one from this morning is not the one from tonight.
 */
export function formatCheckedAt(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Whether a result offers «Записать визит к врачу» (spec §7.22): every level
 * but «ВСЁ В ПОРЯДКЕ», and only for a check about a pet — a visit belongs in
 * a pet's record.
 */
export function offersVisit(check: { urgency: string; pet_id: string | null }): boolean {
  return check.pet_id !== null && check.urgency !== 'healthy'
}

/** The first line of what the owner described: the visit's reason. */
export function visitReason(symptoms: string): string {
  return (symptoms.split('\n').find((line) => line.trim() !== '') ?? '').trim().slice(0, 500)
}
