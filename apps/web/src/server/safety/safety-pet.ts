import 'server-only'

import type { PetSpecies } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/** The part of a pet's profile the «Можно ли» answers read: its species and the two lists the notes come from. */
export type SafetyPet = {
  id: string
  species: PetSpecies
  allergies: string[]
  chronic_conditions: string[]
}

/**
 * One of the caller's own pets that is not deleted. Someone else's pet is
 * indistinguishable from one that never existed, and its profile is never read.
 */
export async function loadSafetyPet(
  supabase: SupabaseService,
  userId: string,
  petId: string,
): Promise<{ ok: true; pet: SafetyPet } | { ok: false; reason: 'not_found' | 'storage_error' }> {
  const { data, error } = await supabase
    .from('pets')
    .select('species, allergies, chronic_conditions')
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return { ok: false, reason: 'storage_error' }
  if (!data) return { ok: false, reason: 'not_found' }
  const row = data as { species: PetSpecies; allergies: string[] | null; chronic_conditions: string[] | null }
  return {
    ok: true,
    pet: { id: petId, species: row.species, allergies: row.allergies ?? [], chronic_conditions: row.chronic_conditions ?? [] },
  }
}

