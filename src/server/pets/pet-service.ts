import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { sanitizePet } from '@/shared/utils/pet-utils'

type SupabaseService = ReturnType<typeof createServiceClient>

export async function listPets(supabase: SupabaseService, userId: string) {
  return supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50)
}

export async function createPet(
  supabase: SupabaseService,
  userId: string,
  body: Record<string, unknown>,
) {
  return supabase
    .from('pets')
    .insert({ ...sanitizePet(body), user_id: userId })
    .select()
    .single()
}

export async function updatePet(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  body: Record<string, unknown>,
) {
  return supabase
    .from('pets')
    .update(sanitizePet(body))
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .single()
}

export async function softDeletePetAndChecks(
  supabase: SupabaseService,
  userId: string,
  petId: string,
) {
  const now = new Date().toISOString()
  const deletedPet = await supabase
    .from('pets')
    .update({ deleted_at: now })
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .single()

  if (deletedPet.error || !deletedPet.data) return deletedPet

  const checks = await supabase
    .from('symptom_checks')
    .update({ deleted_at: now })
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (checks.error) {
    return { data: null, error: checks.error }
  }

  return deletedPet
}

/** @deprecated Use listPets */
export const listCats = listPets
/** @deprecated Use createPet */
export const createCat = createPet
/** @deprecated Use updatePet */
export const updateCat = updatePet
/** @deprecated Use softDeletePetAndChecks */
export const softDeleteCatAndChecks = softDeletePetAndChecks
