import 'server-only'

import { MedicationSchema, type Medication, type MedicationPatch, type MedicationsInput } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { isFutureDay, utcToday, type WeightResult } from './weight-service'

type SupabaseService = ReturnType<typeof createServiceClient>

type MedicationRow = {
  id: string
  name: string
  dosage: string | null
  started_on: string | null
  ended_on: string | null
  ongoing: boolean
  source: 'record' | 'form'
}

const COLUMNS = 'id, name, dosage, started_on, ended_on, ongoing, source'

function toMedicationContract(row: MedicationRow): Medication {
  return MedicationSchema.parse(row)
}

function failure(error: { code?: string; message: string }): { ok: false; reason: 'not_found' | 'conflict' | 'storage_error' | 'bad_range'; message: string } {
  if (error.code === 'P0002') return { ok: false, reason: 'not_found', message: error.message }
  // The range constraint, reached by a change that raced another.
  if (error.code === '23514') return { ok: false, reason: 'bad_range', message: error.message }
  if (error.code === '23505') return { ok: false, reason: 'conflict', message: error.message }
  return { ok: false, reason: 'storage_error', message: error.message }
}

/** A pet's live courses, current ones first by start, then the rest. */
export async function listMedications(supabase: SupabaseService, petId: string): Promise<WeightResult<Medication[]>> {
  const { data, error } = await supabase
    .from('pet_medications')
    .select(COLUMNS)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .order('started_on', { ascending: false, nullsFirst: false })
    .limit(500)
  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return { ok: true, data: (data as MedicationRow[]).map(toMedicationContract) }
}

async function readByIds(supabase: SupabaseService, ids: readonly string[]): Promise<WeightResult<Medication[]>> {
  const { data, error } = await supabase.from('pet_medications').select(COLUMNS).in('id', ids as string[]).is('deleted_at', null)
  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  const byId = new Map((data as MedicationRow[]).map((row) => [row.id, row]))
  return { ok: true, data: ids.flatMap((id) => (byId.has(id) ? [toMedicationContract(byId.get(id)!)] : [])) }
}

export async function addMedications(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  input: MedicationsInput,
  idempotencyKey: string | null,
  today: string = utcToday(),
): Promise<WeightResult<Medication[]> | { ok: false; reason: 'bad_range'; message: string }> {
  const { data, error } = await supabase.rpc('create_pet_medications', {
    p_user_id: userId,
    p_pet_id: petId,
    p_items: input.items.map((item) => ({
      name: item.name,
      dosage: item.dosage ?? null,
      started_on: item.started_on ?? null,
      ended_on: item.ended_on ?? null,
      ongoing: item.ongoing ?? false,
    })),
    p_today: today,
    p_key: idempotencyKey,
  })
  if (error) return failure(error)
  return readByIds(supabase, data as string[])
}

/**
 * A correction. The stored start and end are merged with the change before
 * the range is checked: moving only the end must still land after the start.
 */
export async function changeMedication(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  medicationId: string,
  patch: MedicationPatch,
  today: string = utcToday(),
): Promise<WeightResult<Medication> | { ok: false; reason: 'bad_range'; message?: string }> {
  const { data: current, error: readError } = await supabase
    .from('pet_medications')
    .select(COLUMNS)
    .eq('id', medicationId)
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (readError) return { ok: false, reason: 'storage_error', message: readError.message }
  if (!current) return { ok: false, reason: 'not_found' }

  const merged = { ...(current as MedicationRow), ...patch }
  if (merged.ongoing && merged.ended_on) return { ok: false, reason: 'bad_range' }
  if (merged.started_on && merged.ended_on && merged.ended_on < merged.started_on) return { ok: false, reason: 'bad_range' }

  // «Завершить курс» sends the phone's own today, which east of UTC is ahead
  // of the server's: counting from it takes the course off the list now.
  const listDay = patch.ended_on && patch.ended_on > today && !isFutureDay(patch.ended_on) ? patch.ended_on : today

  const { error } = await supabase.rpc('change_pet_medication', {
    p_user_id: userId,
    p_pet_id: petId,
    p_medication_id: medicationId,
    p_changes: patch,
    p_today: listDay,
  })
  if (error) return failure(error)
  const read = await readByIds(supabase, [medicationId])
  if (!read.ok) return read
  return read.data[0] ? { ok: true, data: read.data[0] } : { ok: false, reason: 'not_found' }
}

export async function deleteMedication(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  medicationId: string,
  today: string = utcToday(),
): Promise<WeightResult<null> | { ok: false; reason: 'bad_range'; message: string }> {
  const { error } = await supabase.rpc('delete_pet_medication', {
    p_user_id: userId,
    p_pet_id: petId,
    p_medication_id: medicationId,
    p_today: today,
  })
  if (error) return failure(error)
  return { ok: true, data: null }
}

/** The pet form saved its list; see sync_form_medications. */
export async function syncFormMedications(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  names: readonly string[],
  today: string,
): Promise<WeightResult<null> | { ok: false; reason: 'bad_range'; message: string }> {
  const { error } = await supabase.rpc('sync_form_medications', {
    p_user_id: userId,
    p_pet_id: petId,
    p_names: names as string[],
    p_today: today,
  })
  if (error) return failure(error)
  return { ok: true, data: null }
}

/** Whether a course is going on on `today`: no end, or an end after it. */
export function isCurrentCourse(course: Pick<Medication, 'ended_on'>, today: string = utcToday()): boolean {
  return course.ended_on === null || course.ended_on > today
}
