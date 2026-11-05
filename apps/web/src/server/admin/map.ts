import 'server-only'

import {
  ADMIN_URGENCIES,
  type AdminCheckRow,
  type AdminDaily,
  type AdminFeedbackRow,
  type AdminMetric,
  type AdminRatio,
  type AdminRatioPart,
  type AdminUrgency,
} from '@/shared/types/admin'

/**
 * The `jsonb` of the admin SQL functions, read defensively: a missing number
 * is 0, a missing list is empty, and nothing from the database is trusted to
 * have the shape the migration promised.
 */

type Raw = Record<string, unknown>

export function asObject(raw: unknown): Raw {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Raw) : {}
}

function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

export function toNumber(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function toNullableNumber(raw: unknown): number | null {
  return raw === null || raw === undefined ? null : toNumber(raw)
}

function toText(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null
}

function toTexts(raw: unknown): string[] {
  return asArray(raw).filter((item): item is string => typeof item === 'string')
}

export function toMetric(raw: unknown): AdminMetric {
  const value = asObject(raw)
  return { cur: toNumber(value.cur), prev: toNullableNumber(value.prev) }
}

function toRatioPart(raw: unknown): AdminRatioPart {
  const value = asObject(raw)
  return { num: toNumber(value.num), den: toNumber(value.den) }
}

export function toRatio(raw: unknown): AdminRatio {
  const value = asObject(raw)
  return {
    cur: toRatioPart(value.cur),
    prev: value.prev === null || value.prev === undefined ? null : toRatioPart(value.prev),
  }
}

export function toCounts<K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> {
  const value = asObject(raw)
  return Object.fromEntries(keys.map(key => [key, toNumber(value[key])])) as Record<K, number>
}

/** Every key the database sent, as counts: providers, locales, error codes. */
export function toOpenCounts(raw: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(asObject(raw)).map(([key, value]) => [key, toNumber(value)]))
}

export function toDaily<K extends string>(raw: unknown, keys: readonly K[]): AdminDaily<K> {
  return asArray(raw).map(point => {
    const value = asObject(point)
    return { date: String(value.date ?? ''), ...toCounts(value, keys) }
  }) as AdminDaily<K>
}

function toUrgency(raw: unknown): AdminUrgency | null {
  return ADMIN_URGENCIES.includes(raw as AdminUrgency) ? (raw as AdminUrgency) : null
}

function toRating(raw: unknown): 'liked' | 'disliked' | null {
  return raw === 'liked' || raw === 'disliked' ? raw : null
}

export function toCheckRow(raw: unknown): AdminCheckRow {
  const value = asObject(raw)
  const answers = asObject(value.answers)
  return {
    id: String(value.id ?? ''),
    createdAt: String(value.created_at ?? ''),
    species: value.species === 'cat' || value.species === 'dog' ? value.species : null,
    petAgeYears: toNullableNumber(value.pet_age_years),
    symptoms: toText(value.symptoms) ?? '',
    urgency: toUrgency(value.urgency),
    urgencyReason: toText(value.urgency_reason),
    possibleCauses: toTexts(value.possible_causes),
    homeCareSteps: toTexts(value.home_care_steps),
    vetQuestions: toTexts(value.vet_questions),
    answers: {
      appetite: toText(answers.appetite),
      activity: toText(answers.activity),
      duration: toText(answers.duration),
      stool: toText(answers.stool),
      painSigns: toTexts(answers.pain_signs),
    },
    rating: toRating(value.rating),
    comment: toText(value.comment),
  }
}

export function toFeedbackRow(raw: unknown): AdminFeedbackRow {
  const value = asObject(raw)
  return {
    id: String(value.id ?? ''),
    at: String(value.at ?? ''),
    rating: toRating(value.rating) ?? 'liked',
    comment: toText(value.comment) ?? '',
    check: value.check ? toCheckRow(value.check) : null,
  }
}

export function toFeed<T>(raw: unknown, row: (raw: unknown) => T): { rows: T[]; hasMore: boolean } {
  const value = asObject(raw)
  return { rows: asArray(value.rows).map(row), hasMore: value.has_more === true }
}
