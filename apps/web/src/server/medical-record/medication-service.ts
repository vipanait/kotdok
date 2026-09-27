import 'server-only'

import { MedicationSchema, type Medication, type MedicationPatch, type MedicationsInput } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { RECORD_DONE_SQLSTATE, isFutureDay, utcToday, type WeightResult } from './weight-service'

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
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
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
 *
 * `ownerToday`: the owner's calendar day as the app sent it (`?today=`,
 * already checked by `clientToday`'s window), or null. With it, a course
 * whose end is that day or earlier is finished and refused — the owner's own
 * day, as the apps hide «Изменить» — unless the server's window already
 * counts a later end finished: the later of the two decides, so the owner's
 * day only tightens the guard. Without it (older apps), the server's window:
 * finished in every time zone (`courseOverEverywhere`).
 */
export async function changeMedication(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  medicationId: string,
  patch: MedicationPatch,
  now: Date = new Date(),
  ownerToday: string | null = null,
): Promise<WeightResult<Medication> | { ok: false; reason: 'bad_range' | 'record_done'; message?: string }> {
  const today = utcToday(now)
  const overBy = courseOverBy(now, ownerToday)
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

  // A finished course is history (owner rule of 26 September 2026): read,
  // deleted if wrong, never corrected — nor started again by moving its end.
  // Sending what it already holds, such as «Завершить курс» again after a
  // lost answer, is not a change and is answered with the course.
  // A clear answer before any work; change_pet_medication makes the same
  // decision again under the pet's lock (a course finished on another device
  // between this read and the write is refused there, SQLSTATE LP409).
  if (courseFinished(current as MedicationRow, overBy)) {
    if (!changesCourse(current as MedicationRow, patch)) return { ok: true, data: toMedicationContract(current as MedicationRow) }
    return { ok: false, reason: 'record_done' }
  }

  const merged = { ...(current as MedicationRow), ...patch }
  if (merged.ongoing && merged.ended_on) return { ok: false, reason: 'bad_range' }
  if (merged.started_on && merged.ended_on && merged.ended_on < merged.started_on) return { ok: false, reason: 'bad_range' }

  // The pet form's list is counted from the owner's day when the app said it
  // (`?today=`). Without it (older apps): «Завершить курс» sends the phone's
  // own today as the end, which east of UTC is ahead of the server's —
  // counting from it takes the course off the list now.
  const listDay =
    ownerToday ?? (patch.ended_on && patch.ended_on > today && !isFutureDay(patch.ended_on, now) ? patch.ended_on : today)

  const { error } = await supabase.rpc('change_pet_medication', {
    p_user_id: userId,
    p_pet_id: petId,
    p_medication_id: medicationId,
    p_changes: patch,
    p_today: listDay,
    p_over_by: overBy,
  })
  if (error) return error.code === RECORD_DONE_SQLSTATE ? { ok: false, reason: 'record_done' } : failure(error)
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
  /** The list the form was opened with, when the client says. */
  before: readonly string[] | null = null,
): Promise<WeightResult<null> | { ok: false; reason: 'bad_range'; message: string }> {
  const { error } = await supabase.rpc('sync_form_medications', {
    p_user_id: userId,
    p_pet_id: petId,
    p_names: names as string[],
    p_today: today,
    p_before: before as string[] | null,
  })
  if (error) return failure(error)
  return { ok: true, data: null }
}

/**
 * Whether a course has ended for every owner, wherever they are: its last
 * day is today or earlier even in the westernmost time zone (UTC−12), whose
 * today is the earliest on Earth. The server does not know the owner's zone;
 * the apps hide «Изменить» by the owner's own day, and this refuses the
 * change once no owner anywhere can still be in the course — never a course
 * that is current for someone. A course ended today east of UTC is therefore
 * refused a few hours later, not at once; the apps never offer the change.
 */
export function courseOverEverywhere(course: Pick<Medication, 'ended_on'>, now: Date = new Date()): boolean {
  return courseFinished(course, courseOverBy(now, null))
}

/**
 * The last day a course may end on and count as finished: the UTC day of
 * twelve hours ago — today in the westernmost zone (`courseOverEverywhere`)
 * — or the owner's today when the app said it and it is later.
 */
export function courseOverBy(now: Date, ownerToday: string | null): string {
  const everywhere = utcToday(new Date(now.getTime() - 12 * 60 * 60 * 1000))
  // The later of the two: the owner's day only ever tightens the guard. A day
  // behind the fallback (an owner west of UTC, or a client that says
  // «yesterday») must not reopen a course the server already counts finished.
  return ownerToday !== null && ownerToday > everywhere ? ownerToday : everywhere
}

/** Whether a course ended on `overBy` or earlier: history, not to be changed. */
export function courseFinished(course: Pick<Medication, 'ended_on'>, overBy: string): boolean {
  return course.ended_on !== null && course.ended_on <= overBy
}

/** Whether a patch would change anything of the course as stored (texts as the database keeps them). */
export function changesCourse(
  course: Pick<Medication, 'name' | 'dosage' | 'started_on' | 'ended_on' | 'ongoing'>,
  patch: MedicationPatch,
): boolean {
  const text = (value: string | null | undefined) => {
    const trimmed = value?.trim() ?? ''
    return trimmed === '' ? null : trimmed
  }
  return (Object.keys(patch) as (keyof MedicationPatch)[]).some((key) => {
    switch (key) {
      case 'name':
        return text(patch.name) !== text(course.name)
      case 'dosage':
        return text(patch.dosage) !== course.dosage
      case 'started_on':
        return (patch.started_on ?? null) !== course.started_on
      case 'ended_on':
        return (patch.ended_on ?? null) !== course.ended_on
      case 'ongoing':
        return (patch.ongoing ?? false) !== course.ongoing
    }
  })
}

