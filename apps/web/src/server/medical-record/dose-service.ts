import 'server-only'

import type { MedicationDose, MedicationDoseInput } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { isFutureDay, type WeightResult } from './weight-service'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * «Дали» (FB-5): a dose of a course given on the owner's day, at one of its
 * times. One row per dose; a second mark of the same dose is that dose.
 */

export type DoseFailure = 'not_found' | 'bad_slot' | 'future' | 'storage_error'

const COLUMNS = 'medication_id, taken_on, slot'

async function liveCourse(supabase: SupabaseService, userId: string, petId: string, medicationId: string) {
  const { data, error } = await supabase
    .from('pet_medications')
    .select('id, reminder_times')
    .eq('id', medicationId)
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return { ok: false as const, reason: 'storage_error' as const }
  if (!data) return { ok: false as const, reason: 'not_found' as const }
  return { ok: true as const, times: (data.reminder_times as string[]) ?? [] }
}

/** @returns the dose and whether it was new (201) or already there (200). */
export async function markDose(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  medicationId: string,
  input: MedicationDoseInput,
  now: Date = new Date(),
): Promise<{ ok: true; dose: MedicationDose; created: boolean } | { ok: false; reason: DoseFailure }> {
  const course = await liveCourse(supabase, userId, petId, medicationId)
  if (!course.ok) return course
  if (!course.times.includes(input.slot)) return { ok: false, reason: 'bad_slot' }
  if (isFutureDay(input.taken_on, now)) return { ok: false, reason: 'future' }

  const row = { user_id: userId, pet_id: petId, medication_id: medicationId, taken_on: input.taken_on, slot: input.slot }
  const { data, error } = await supabase
    .from('medication_doses')
    .upsert(row, { onConflict: 'medication_id,taken_on,slot', ignoreDuplicates: true })
    .select(COLUMNS)
  if (error) return { ok: false, reason: 'storage_error' }
  if (data && data.length > 0) return { ok: true, dose: data[0] as MedicationDose, created: true }
  return { ok: true, dose: { medication_id: medicationId, taken_on: input.taken_on, slot: input.slot }, created: false }
}

export async function unmarkDose(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  medicationId: string,
  input: MedicationDoseInput,
): Promise<{ ok: true } | { ok: false; reason: DoseFailure }> {
  const course = await liveCourse(supabase, userId, petId, medicationId)
  if (!course.ok) return course
  const { error } = await supabase
    .from('medication_doses')
    .delete()
    .eq('medication_id', medicationId)
    .eq('user_id', userId)
    .eq('taken_on', input.taken_on)
    .eq('slot', input.slot)
  if (error) return { ok: false, reason: 'storage_error' }
  return { ok: true }
}

/** A pet's doses between two days, at most a month apart. */
export async function listDoses(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  from: string,
  to: string,
): Promise<WeightResult<MedicationDose[]>> {
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('id')
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (petError) return { ok: false, reason: 'storage_error', message: petError.message }
  if (!pet) return { ok: false, reason: 'not_found' }

  const { data, error } = await supabase
    .from('medication_doses')
    .select(COLUMNS)
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .gte('taken_on', from)
    .lte('taken_on', to)
    .order('taken_on')
    .order('slot')
  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return { ok: true, data: data as MedicationDose[] }
}
