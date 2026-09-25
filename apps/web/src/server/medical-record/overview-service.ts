import 'server-only'

import type { HealthOverview, HealthSection } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { getPet, type PetResult } from '@/server/pets/pet-service'
import { toPetContract } from '@/server/pets/pet-contract'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Sections this server stores records for. Each medical record stage adds its
 * own section here together with the table behind it; until then the client
 * shows the section from the pet form alone and offers no "add".
 */
const WRITABLE_SECTIONS: HealthSection[] = []

/**
 * The medical record of one pet.
 *
 * Ownership, soft deletion and the account's state are checked by `getPet`,
 * so the record can never be wider than the pet form the caller may already read.
 */
export async function getHealthOverview(
  supabase: SupabaseService,
  userId: string,
  petId: string,
): Promise<PetResult<HealthOverview>> {
  const pet = await getPet(supabase, userId, petId)
  if (!pet.ok) return pet

  return { ok: true, data: { pet: toPetContract(pet.data), writable: [...WRITABLE_SECTIONS] } }
}
