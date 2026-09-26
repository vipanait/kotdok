import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import { sanitizePet } from '@/shared/utils/pet-utils'
import type { Pet } from '@/shared/types'
import { WEIGHT_MAX_KG } from '@lapka/contracts'
import { clientToday, isFutureDay, recordWeight, utcToday } from '@/server/medical-record/weight-service'
import { syncFormMedications } from '@/server/medical-record/medication-service'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Pet operations return plain data and a reason, not a Supabase result object,
 * so an adapter never has to know how the storage layer reports failure.
 */
export type PetFailure = 'not_found' | 'account_deleting' | 'storage_error'

export type PetResult<T> = { ok: true; data: T } | { ok: false; reason: PetFailure; message?: string }

/** Refuses anything but an active account, so no operation can forget the check. */
async function requireActiveAccount(
  supabase: SupabaseService,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: PetFailure }> {
  const account = await loadAccount(supabase, userId)
  if (account.ok) return { ok: true }

  return { ok: false, reason: account.reason === 'account_deleting' ? 'account_deleting' : 'not_found' }
}

export async function listPets(
  supabase: SupabaseService,
  userId: string,
): Promise<PetResult<Pet[]>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return { ok: true, data: (data ?? []) as Pet[] }
}

export async function getPet(
  supabase: SupabaseService,
  userId: string,
  petId: string,
): Promise<PetResult<Pet>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  // Someone else's pet is indistinguishable from one that never existed.
  if (!data) return { ok: false, reason: 'not_found' }
  return { ok: true, data: data as Pet }
}

/**
 * The form's weight as a measurement for its day, so the medical record's
 * history fills in even for an owner who never opens it (spec §4).
 *
 * Zero is a weight the form accepts and a measurement cannot be; it records
 * nothing. The day is the owner's own when the client sends it.
 */
function formWeight(body: Record<string, unknown>, sanitized: { weight_kg: number | null }) {
  const kg = sanitized.weight_kg
  if (kg === null || kg <= 0 || kg > WEIGHT_MAX_KG) return null

  // The v1 routes refuse a future or malformed day; the older web routes pass
  // bodies through unchecked, so here it falls back rather than trusting it.
  const given = body.weight_measured_on
  const day =
    typeof given === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(given) && !isFutureDay(given) ? given : utcToday()
  return { measured_on: day, weight_kg: kg }
}

/**
 * The owner's day for the form's medicines (a name added starts a course on
 * it, a name removed ends one): the weighing day both apps send, which is
 * their own today. Trusted only from the UTC day before the server's to the
 * UTC day after, like the summary's `?today=` (`clientToday`) — an older client's past weighing
 * day must not start a course in the past; otherwise today in UTC.
 */
function formDay(body: Record<string, unknown>): string {
  return clientToday(body.weight_measured_on)
}

/** Whether the pet has any live measurement, so the form cannot blank a weight the history still holds. */
async function hasWeights(supabase: SupabaseService, petId: string): Promise<boolean> {
  const { data } = await supabase
    .from('pet_weights')
    .select('id')
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .limit(1)
  return (data ?? []).length > 0
}

export async function createPet(
  supabase: SupabaseService,
  userId: string,
  body: Record<string, unknown>,
): Promise<PetResult<Pet>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const pet = sanitizePet(body)
  const weight = formWeight(body, pet)

  // With a weight, the pet is created without it and the weight goes in as
  // its first measurement, which sets the form's value. Inserted with it, the
  // record would see "no change" and keep the weight undated.
  const { data, error } = await supabase
    .from('pets')
    .insert({
      ...pet,
      vaccinated_form: pet.vaccinated,
      // The list is set by the courses it starts, below.
      medications: [],
      ...(weight ? { weight_kg: null } : {}),
      user_id: userId,
    })
    .select()
    .single()

  if (error || !data) return { ok: false, reason: 'storage_error', message: error?.message }
  const created = data as Pet

  if (pet.medications.length > 0) {
    const synced = await syncFormMedications(supabase, userId, created.id, pet.medications, formDay(body))
    if (!synced.ok) {
      console.error('[pets] first medicines not recorded', synced.message)
      await supabase.from('pets').update({ medications: pet.medications }).eq('id', created.id)
    }
  }
  if (!weight) return readCreated(supabase, userId, created)

  // Not allowed to fail the creation: a retry would create the pet twice. If
  // the history cannot take the weight, the form keeps it as before.
  const recorded = await recordWeight(supabase, userId, created.id, weight, 'form')
  if (!recorded.ok) {
    console.error('[pets] first weight not recorded', recorded.message)
    await supabase.from('pets').update({ weight_kg: pet.weight_kg }).eq('id', created.id)
  }

  return readCreated(supabase, userId, created)
}

/**
 * The new pet as the history left it. The pet exists whatever happens here:
 * a failed read answers with the row as inserted, never with an error a
 * client would retry into a second pet.
 */
async function readCreated(supabase: SupabaseService, userId: string, created: Pet): Promise<PetResult<Pet>> {
  const read = await getPet(supabase, userId, created.id)
  return read.ok ? read : { ok: true, data: created }
}

export async function updatePet(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  body: Record<string, unknown>,
): Promise<PetResult<Pet>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const sanitized = sanitizePet(body)
  // The medicines list is the courses' to set (MR-06): the form's list goes
  // through sync_form_medications, never straight into the column.
  const { medications: formMedications, ...rest } = sanitized
  const withoutWeight: Partial<typeof sanitized> = { ...rest }
  delete withoutWeight.weight_kg
  let pet: Partial<typeof sanitized> = rest

  // Before the form is saved: the record keeps the form's previous weight as
  // history, so it has to see it first. Once the weight is in the history,
  // the history decides the form's weight — the newest measurement, which is
  // not always the one just saved — so the update leaves the column alone.
  // Sent back as it was opened, the form's weight is not a new measurement:
  // a newer one may have come in since, and would be overwritten by old data.
  const unchangedWeight = 'weight_kg_before' in body && body.weight_kg_before === sanitized.weight_kg
  const weight = unchangedWeight ? null : formWeight(body, sanitized)
  if (weight) {
    const recorded = await recordWeight(supabase, userId, petId, weight, 'form')
    if (!recorded.ok) {
      return { ok: false, reason: recorded.reason === 'not_found' ? 'not_found' : 'storage_error', message: recorded.message }
    }
    pet = withoutWeight
  } else if (unchangedWeight || (await hasWeights(supabase, petId))) {
    // Clearing the field does not delete measurements, and the form would
    // disagree with the history it points to.
    pet = withoutWeight
  }

  // The answer is the owner's; what the pet is shown as also counts the
  // vaccinations in the record, so it is worked out after the update. The
  // form shows that combined value: sent back unchanged, it is not the
  // owner's answer, and the answer already given stays.
  const { data: current } = await supabase
    .from('pets')
    .select('vaccinated, vaccinated_form')
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  const vaccinatedForm =
    current && 'vaccinated' in body && sanitized.vaccinated === current.vaccinated && current.vaccinated !== current.vaccinated_form
      ? current.vaccinated_form
      : sanitized.vaccinated
  const { data: updated, error: updateError } = await supabase
    .from('pets')
    .update({ ...pet, vaccinated_form: vaccinatedForm })
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    // maybeSingle, not single: a pet that belongs to someone else matches no
    // row, and `single` reports that as an error rather than as absence, which
    // turned "not yours" into a 500.
    .maybeSingle()

  if (updateError) return { ok: false, reason: 'storage_error', message: updateError.message }
  if (!updated) return { ok: false, reason: 'not_found' }

  const synced = await supabase.rpc('sync_pet_vaccinated', { p_pet_id: petId })
  if (synced.error) return { ok: false, reason: 'storage_error', message: synced.error.message }

  // Only when the body speaks about medicines: sanitizePet fills an absent
  // list with [], and a partial update must not end every course.
  if ('medications' in body) {
    const before = Array.isArray(body.medications_before) ? (body.medications_before as string[]) : null
    const medicines = await syncFormMedications(supabase, userId, petId, formMedications, formDay(body), before)
    if (!medicines.ok) return { ok: false, reason: 'storage_error', message: medicines.message }
  }

  return getPet(supabase, userId, petId)
}

export async function softDeletePetAndChecks(
  supabase: SupabaseService,
  userId: string,
  petId: string,
): Promise<PetResult<Pet>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const now = new Date().toISOString()
  const deletedPet = await supabase
    .from('pets')
    .update({ deleted_at: now })
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (deletedPet.error) return { ok: false, reason: 'storage_error', message: deletedPet.error.message }
  if (!deletedPet.data) return { ok: false, reason: 'not_found' }

  const checks = await supabase
    .from('symptom_checks')
    .update({ deleted_at: now })
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (checks.error) return { ok: false, reason: 'storage_error', message: checks.error.message }

  return { ok: true, data: deletedPet.data as Pet }
}
