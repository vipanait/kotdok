import 'server-only'

import {
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
 * The SQL functions answer "not yours" and "no such row" with no_data_found,
 * and a day that is already taken with unique_violation.
 */
function failure(error: { code?: string; message: string }): { ok: false; reason: ServiceFailure; message: string } {
  if (error.code === 'P0002') return { ok: false, reason: 'not_found', message: error.message }
  if (error.code === '23505') return { ok: false, reason: 'conflict', message: error.message }
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

export async function recordWeight(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  input: WeightInput,
  source: 'record' | 'form' = 'record',
): Promise<WeightResult<WeightMeasurement | null>> {
  const { data, error } = await supabase.rpc('record_pet_weight', {
    p_user_id: userId,
    p_pet_id: petId,
    p_measured_on: input.measured_on,
    p_weight_kg: input.weight_kg,
    p_source: source,
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
): Promise<WeightResult<WeightMeasurement>> {
  const { data, error } = await supabase.rpc('change_pet_weight', {
    p_user_id: userId,
    p_pet_id: petId,
    p_weight_id: weightId,
    p_measured_on: patch.measured_on ?? null,
    p_weight_kg: patch.weight_kg ?? null,
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

  if (error) return failure(error)
  return { ok: true, data: null }
}

/** Today as a calendar day in UTC: the fallback when a client did not say its own day. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Whether a day is later than any time zone's today. A weighing cannot be in
 * the future; a day ahead of UTC is still "today" somewhere east of it.
 */
export function isFutureDay(day: string, now: Date = new Date()): boolean {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return day > utcToday(tomorrow)
}

/**
 * Whether a day is earlier than any time zone's today: a plan cannot be made
 * for it. A day behind UTC is still "today" somewhere west of it.
 */
export function isPastDay(day: string, now: Date = new Date()): boolean {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return day < utcToday(yesterday)
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
