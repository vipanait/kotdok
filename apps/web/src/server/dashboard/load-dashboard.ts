import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import { readExtraCheckRequestStatus } from '@/server/extra-check/extra-check-service'
import type { Pet, PetLatestCheck } from '@/shared/types'
import type { DueItem, SymptomCheckRecord } from '@lapka/contracts'
import { nearestDueByPet, toUtcIso } from '@lapka/shared'
import { listDue } from '@/server/medical-record/event-service'
import { mapSymptomCheckRow, symptomCheckSelect } from '@/server/symptom-check/map-symptom-check'

export type { PetLatestCheck }

export interface PetsOverview {
  pets: Pet[]
  /** The newest check of each pet, by pet id; a pet with no checks has no entry. */
  latestChecksByPet: Record<string, PetLatestCheck>
  /**
   * The one due date each pet's row names, by pet id (spec §7.1): the
   * earliest, overdue or within fourteen days of `today`. A pet with none
   * has no entry.
   */
  dueByPet: Record<string, DueItem>
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
 * Every pet's due line from one read of all the owner's plans (`listDue`,
 * the same list the phone's pet list reads) — never a medical record per
 * pet. The line only points somewhere: a failed read leaves the rows without
 * it and is logged, rather than taking the pet list down with it.
 */
async function loadDueByPet(service: ReturnType<typeof createServiceClient>, userId: string, today: string) {
  const due = await listDue(service, userId)
  if (!due.ok) {
    console.error('[dashboard] due lines left out: the plans could not be read', due.message)
    return {}
  }
  return nearestDueByPet(due.data, today)
}

/**
 * The user's pets with the latest check of each and the nearest due date:
 * what a pet row shows. Used by the overview and by `/pets`. `today` is the
 * owner's calendar day (their time zone), which decides "overdue" and "soon".
 *
 * Takes a user the caller has already let in (see `loadCabinetUser`). A
 * failed query throws rather than passing for an empty list: "no pets yet"
 * would send the owner to add a pet they already have.
 */
export async function loadPetsOverview(userId: string, today: string): Promise<PetsOverview> {
  const service = createServiceClient()

  const [
    { data: pets, error: petsError },
    { data: recentPetChecks, error: recentError },
    dueByPet,
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
    loadDueByPet(service, userId, today),
  ])

  if (petsError) throw new Error(`pets: ${petsError.message}`)
  if (recentError) throw new Error(`recent pet checks: ${recentError.message}`)

  const latestChecksByPet: Record<string, PetLatestCheck> = {}
  for (const row of recentPetChecks ?? []) {
    const petId = row.pet_id as string | null
    if (!petId || latestChecksByPet[petId]) continue
    latestChecksByPet[petId] = {
      urgency: row.urgency as string,
      // Stored without a zone; read as UTC so no clock shifts it.
      created_at: toUtcIso(row.created_at as string),
    }
  }

  return { pets: (pets ?? []) as Pet[], latestChecksByPet, dueByPet }
}

/**
 * Everything the overview renders besides the cabinet frame: pets, the
 * newest checks and the state of the extra-check request.
 */
export async function loadDashboard(userId: string, today: string): Promise<DashboardData> {
  const service = createServiceClient()

  const [overview, checksResult, latestRequestStatus] = await Promise.all([
    loadPetsOverview(userId, today),
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
    checks: (checksResult.data ?? []).map(row => {
      const check = mapSymptomCheckRow(row as never)
      return { ...check, created_at: toUtcIso(check.created_at) }
    }),
    latestRequestStatus,
  }
}
