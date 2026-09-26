import 'server-only'

import type { HealthOverview, HealthSection } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { getPet, type PetResult } from '@/server/pets/pet-service'
import { toPetContract } from '@/server/pets/pet-contract'
import { isCurrentCourse } from '@lapka/shared'
import { listWeights, utcToday } from './weight-service'
import { listEvents } from './event-service'
import { listMedications } from './medication-service'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Sections this server stores records for. Each medical record stage adds its
 * own section here together with the table behind it; until then the client
 * shows the section from the pet form alone and offers no "add".
 */
const WRITABLE_SECTIONS: HealthSection[] = ['vaccinations', 'parasites', 'visits', 'medications', 'weight']

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

  const [weights, events, medications] = await Promise.all([
    listWeights(supabase, petId),
    listEvents(supabase, petId),
    listMedications(supabase, petId),
  ])
  if (!weights.ok) return { ok: false, reason: 'storage_error', message: weights.message }
  if (!events.ok) return { ok: false, reason: 'storage_error', message: events.message }
  if (!medications.ok) return { ok: false, reason: 'storage_error', message: medications.message }

  // The stored list is refreshed on writes; a course that ran out since is
  // left out here, when there are courses to go by. By the shared rule
  // (`isCurrentCourse`, the apps' own), counted on the UTC day: this read
  // carries no day of the owner's (GET /health has no `today`), and the apps
  // sort the courses themselves by their own day — this list is the form's.
  const form = toPetContract(pet.data)
  const today = utcToday()
  const current = medications.data.filter((course) => isCurrentCourse(course, today))
  const names = [...new Map(current.map((course) => [course.name.trim().toLowerCase(), course.name.trim()])).values()]

  return {
    ok: true,
    data: {
      pet: medications.data.length > 0 ? { ...form, medications: names } : form,
      writable: [...WRITABLE_SECTIONS],
      weights: weights.data,
      events: events.data,
      medications: medications.data,
    },
  }
}
