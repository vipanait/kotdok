import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import { readExtraCheckRequestStatus } from '@/server/extra-check/extra-check-service'
import type { Pet, PetLatestCheck } from '@/shared/types'
import type { SymptomCheckRecord } from '@lapka/contracts'
import { mapSymptomCheckRow, symptomCheckSelect } from '@/server/symptom-check/map-symptom-check'

export type { PetLatestCheck }

export interface PetsOverview {
  pets: Pet[]
  /** The newest check of each pet, by pet id; a pet with no checks has no entry. */
  latestChecksByPet: Record<string, PetLatestCheck>
}

export interface DashboardData extends PetsOverview {
  /** The newest checks, for the "recent checks" card. */
  checks: SymptomCheckRecord[]
  latestRequestStatus: 'pending' | 'approved' | 'rejected' | null
}

const HISTORY_LIMIT = 3

/** How many recent checks are scanned for each pet's latest one. */
const LATEST_PER_PET_SCAN = 50

/**
 * The user's pets with the latest check of each: what a pet card shows.
 * Used by the overview and by `/pets`.
 *
 * Takes a user the caller has already let in (see `loadCabinetUser`). A
 * failed query throws rather than passing for an empty list: "no pets yet"
 * would send the owner to add a pet they already have.
 */
export async function loadPetsOverview(userId: string): Promise<PetsOverview> {
  const service = createServiceClient()

  const [
    { data: pets, error: petsError },
    { data: recentPetChecks, error: recentError },
  ] = await Promise.all([
    service
      .from('pets')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    service
      .from('symptom_checks')
      .select('pet_id, urgency, created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('pet_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(LATEST_PER_PET_SCAN),
  ])

  if (petsError) throw new Error(`pets: ${petsError.message}`)
  if (recentError) throw new Error(`recent pet checks: ${recentError.message}`)

  const latestChecksByPet: Record<string, PetLatestCheck> = {}
  for (const row of recentPetChecks ?? []) {
    const petId = row.pet_id as string | null
    if (!petId || latestChecksByPet[petId]) continue
    latestChecksByPet[petId] = {
      urgency: row.urgency as string,
      created_at: row.created_at as string,
    }
  }

  return { pets: (pets ?? []) as Pet[], latestChecksByPet }
}

/**
 * Everything the overview renders besides the cabinet frame: pets, the
 * newest checks and the state of the extra-check request.
 */
export async function loadDashboard(userId: string): Promise<DashboardData> {
  const service = createServiceClient()

  const [overview, checksResult, latestRequestStatus] = await Promise.all([
    loadPetsOverview(userId),
    service
      .from('symptom_checks')
      .select(symptomCheckSelect())
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    readExtraCheckRequestStatus(userId),
  ])

  if (checksResult.error) throw new Error(`recent checks: ${checksResult.error.message}`)

  return {
    ...overview,
    checks: (checksResult.data ?? []).map(row => mapSymptomCheckRow(row as never)),
    latestRequestStatus,
  }
}
