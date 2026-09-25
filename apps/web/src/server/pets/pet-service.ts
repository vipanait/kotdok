import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import { sanitizePet } from '@/shared/utils/pet-utils'
import type { Pet } from '@/shared/types'
import { recordWeight, utcToday } from '@/server/medical-record/weight-service'

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
  if (sanitized.weight_kg === null || sanitized.weight_kg <= 0) return null
  const day = typeof body.weight_measured_on === 'string' ? body.weight_measured_on : utcToday()
  return { measured_on: day, weight_kg: sanitized.weight_kg }
}

export async function createPet(
  supabase: SupabaseService,
  userId: string,
  body: Record<string, unknown>,
): Promise<PetResult<Pet>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const pet = sanitizePet(body)
  const { data, error } = await supabase
    .from('pets')
    .insert({ ...pet, user_id: userId })
    .select()
    .single()

  if (error || !data) return { ok: false, reason: 'storage_error', message: error?.message }

  // After the pet exists, and not allowed to fail its creation: a retry would
  // create the pet twice, and the weight is already on the form either way.
  const weight = formWeight(body, pet)
  if (weight) {
    const recorded = await recordWeight(supabase, userId, (data as Pet).id, weight, 'form')
    if (!recorded.ok) console.error('[pets] first weight not recorded', recorded.message)
  }

  return { ok: true, data: data as Pet }
}

export async function updatePet(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  body: Record<string, unknown>,
): Promise<PetResult<Pet>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const pet = sanitizePet(body)

  // Before the form is saved: the record keeps the form's previous weight as
  // history, so it has to see it first. Then the form update writes the same
  // value the record has just made current.
  const weight = formWeight(body, pet)
  if (weight) {
    const recorded = await recordWeight(supabase, userId, petId, weight, 'form')
    if (!recorded.ok) {
      return { ok: false, reason: recorded.reason === 'not_found' ? 'not_found' : 'storage_error', message: recorded.message }
    }
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
