import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import { sanitizePet } from '@/shared/utils/pet-utils'
import type { Pet } from '@/shared/types'
import { WEIGHT_MAX_KG } from '@lapka/contracts'
import { isFutureDay, recordWeight, utcToday } from '@/server/medical-record/weight-service'

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
    .insert({ ...pet, ...(weight ? { weight_kg: null } : {}), user_id: userId })
    .select()
    .single()

  if (error || !data) return { ok: false, reason: 'storage_error', message: error?.message }
  if (!weight) return { ok: true, data: data as Pet }

  // Not allowed to fail the creation: a retry would create the pet twice. If
  // the history cannot take the weight, the form keeps it as before.
  const created = data as Pet
  const recorded = await recordWeight(supabase, userId, created.id, weight, 'form')
  if (!recorded.ok) {
    console.error('[pets] first weight not recorded', recorded.message)
    await supabase.from('pets').update({ weight_kg: pet.weight_kg }).eq('id', created.id)
  }

  return { ok: true, data: { ...created, weight_kg: pet.weight_kg } }
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
  const withoutWeight: Partial<typeof sanitized> = { ...sanitized }
  delete withoutWeight.weight_kg
  let pet: Partial<typeof sanitized> = sanitized

  // Before the form is saved: the record keeps the form's previous weight as
  // history, so it has to see it first. Once the weight is in the history,
  // the history decides the form's weight — the newest measurement, which is
  // not always the one just saved — so the update leaves the column alone.
  const weight = formWeight(body, sanitized)
  if (weight) {
    const recorded = await recordWeight(supabase, userId, petId, weight, 'form')
    if (!recorded.ok) {
      return { ok: false, reason: recorded.reason === 'not_found' ? 'not_found' : 'storage_error', message: recorded.message }
    }
    pet = withoutWeight
  } else if (await hasWeights(supabase, petId)) {
    // Clearing the field does not delete measurements, and the form would
    // disagree with the history it points to.
    pet = withoutWeight
  }

  const { data, error } = await supabase
    .from('pets')
    .update(pet)
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    // maybeSingle, not single: a pet that belongs to someone else matches no
    // row, and `single` reports that as an error rather than as absence, which
    // turned "not yours" into a 500.
    .maybeSingle()

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  if (!data) return { ok: false, reason: 'not_found' }
  return { ok: true, data: data as Pet }
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
