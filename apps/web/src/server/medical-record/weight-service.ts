import 'server-only'

import {
  CalendarDateSchema,
  WeightMeasurementSchema,
  type WeightInput,
  type WeightMeasurement,
  type WeightPatch,
} from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import type { ServiceFailure } from '@/server/api/failure-response'

type SupabaseService = ReturnType<typeof createServiceClient>

export type WeightResult<T> = { ok: true; data: T } | { ok: false; reason: ServiceFailure; message?: string }

type WeightRow = {
  id: string
  measured_on: string | null
  weight_kg: number
  source: 'record' | 'form'
}

/** Field by field, as for pets: `user_id` and `deleted_at` stay on the server. */
function toWeightContract(row: WeightRow): WeightMeasurement {
  return WeightMeasurementSchema.parse({
    id: row.id,
    measured_on: row.measured_on,
    weight_kg: Number(row.weight_kg),
    source: row.source,
  })
}

/**
 * A 409 of a weight that is not "the day is taken": the Idempotency-Key was
 * used before for other data. The routes say which (weights/route.ts).
 */
export type KeyReused = { ok: false; reason: 'key_reused'; message: string }

/**
 * The SQL functions answer "not yours" and "no such row" with no_data_found,
 * and a day that is already taken with unique_violation — as they do a key
 * sent again with other data, told apart by its message
 * (`pet_weight_by_key`).
 */
function failure(error: { code?: string; message: string }): { ok: false; reason: ServiceFailure; message: string } | KeyReused {
  if (error.code === 'P0002') return { ok: false, reason: 'not_found', message: error.message }
  if (error.code === '23505') {
    if (error.message.includes('idempotency key reused')) return { ok: false, reason: 'key_reused', message: error.message }
    return { ok: false, reason: 'conflict', message: error.message }
  }
  return { ok: false, reason: 'storage_error', message: error.message }
}

/** A pet's live measurements, newest first; the undated one from the form last. */
export async function listWeights(
  supabase: SupabaseService,
  petId: string,
): Promise<WeightResult<WeightMeasurement[]>> {
  const { data, error } = await supabase
    .from('pet_weights')
    .select('id, measured_on, weight_kg, source')
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .order('measured_on', { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return { ok: true, data: (data as WeightRow[]).map(toWeightContract) }
}

/**
 * `idempotencyKey`: the same key with the same weighing answers with the
 * measurement it made — a retry after midnight does not add a second one —
 * and with another weighing is `key_reused`. Null: no key, as before.
 */
export async function recordWeight(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  input: WeightInput,
  source: 'record' | 'form' = 'record',
  idempotencyKey: string | null = null,
): Promise<WeightResult<WeightMeasurement | null> | KeyReused> {
  const { data, error } = await supabase.rpc('record_pet_weight', {
    p_user_id: userId,
    p_pet_id: petId,
    p_measured_on: input.measured_on,
    p_weight_kg: input.weight_kg,
    p_source: source,
    p_key: idempotencyKey,
  })

  if (error) return failure(error)
  // A form save that did not change the weight records nothing.
  const row = data as WeightRow | null
  return { ok: true, data: row && row.id ? toWeightContract(row) : null }
}

export async function changeWeight(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  weightId: string,
  patch: WeightPatch,
  idempotencyKey: string | null = null,
): Promise<WeightResult<WeightMeasurement> | KeyReused> {
  const { data, error } = await supabase.rpc('change_pet_weight', {
    p_user_id: userId,
    p_pet_id: petId,
    p_weight_id: weightId,
    p_measured_on: patch.measured_on ?? null,
    p_weight_kg: patch.weight_kg ?? null,
    p_key: idempotencyKey,
  })

  if (error) return failure(error)
  return { ok: true, data: toWeightContract(data as WeightRow) }
}

export async function deleteWeight(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  weightId: string,
): Promise<WeightResult<null>> {
  const { error } = await supabase.rpc('delete_pet_weight', {
    p_user_id: userId,
    p_pet_id: petId,
    p_weight_id: weightId,
  })

  if (error) {
    const failed = failure(error)
    // Deleting takes no key: it never meets a reused one.
    return failed.reason === 'key_reused' ? { ok: false, reason: 'conflict', message: failed.message } : failed
  }
  return { ok: true, data: null }
}

/**
 * The SQLSTATE the medical record's write functions refuse a change of a
 * record that is history with (migration 20260927100000): a done
 * vaccination or treatment, a visit that happened, a finished course. The
 * refusal and the write are one decision under the pet's lock, so a
 * «Сделано», «Состоялся» or «Завершить курс» from another device cannot
 * slip between a service's check and the write. Answered as `record_done`.
 */
export const RECORD_DONE_SQLSTATE = 'LP409'

/** Today as a calendar day in UTC: the fallback when a client did not say its own day. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Whether a day is after the UTC day that follows the server's: then it is
 * later than any time zone's today. A weighing cannot be in the future; a day
 * ahead of UTC is still "today" somewhere east of it. The margin is a whole
 * UTC day, not the exact UTC+14 edge.
 */
export function isFutureDay(day: string, now: Date = new Date()): boolean {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return day > utcToday(tomorrow)
}

/**
 * Whether a day is before the UTC day that precedes the server's: then it is
 * earlier than any time zone's today, and a plan cannot be made for it. A day
 * behind UTC is still "today" somewhere west of it. The margin is a whole UTC
 * day, not the exact UTC−12 edge.
 */
export function isPastDay(day: string, now: Date = new Date()): boolean {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return day < utcToday(yesterday)
}

/**
 * The owner's today as a client said it (`?today=` of the summary), trusted
 * only from the UTC day before the server's to the UTC day after
 * (`isPastDay`, `isFutureDay`): every zone's today, UTC−12…UTC+14, lies in
 * that window, which is a little wider than the exact edges. Anything else,
 * and nothing at all (an app older than the field), is the server's UTC day,
 * as it always was.
 */
export function clientToday(given: unknown, now: Date = new Date()): string {
  return typeof given === 'string' && CalendarDateSchema.safeParse(given).success && !isPastDay(given, now) && !isFutureDay(given, now)
    ? given
    : utcToday(now)
}

/**
 * The Idempotency-Key of a medical record write: absent is fine (null), but
 * present means 8–200 characters — an empty key would otherwise become one
 * shared by every keyless request.
 */
export function readIdempotencyKey(headers: Headers, name: string): { ok: true; key: string | null } | { ok: false } {
  const key = headers.get(name)
  if (key === null) return { ok: true, key: null }
  return key.length >= 8 && key.length <= 200 ? { ok: true, key } : { ok: false }
}
