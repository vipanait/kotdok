import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import { readExtraCheckRequestStatus } from '@/server/extra-check/extra-check-service'
import type { Pet, PetLatestCheck } from '@/shared/types'
import type { DueItem, FollowupCaseSummary, SymptomCheckRecord } from '@lapka/contracts'
import { nearestDueByPet, toUtcIso } from '@lapka/shared'
import { listDue } from '@/server/medical-record/event-service'
import { signAvatars } from '@/server/pets/avatar-service'
import { mapSymptomCheckRow, symptomCheckSelect } from '@/server/symptom-check/map-symptom-check'
import { loadActiveFollowups } from '@/server/checks/load-followup-pages'

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
  /** The owner's photo of each pet that has one, as a short-lived signed link (FB-4). */
  photosByPet: Record<string, string>
}

export interface DashboardData extends PetsOverview {
  /** The newest checks, for the "recent checks" card. */
  checks: SymptomCheckRecord[]
  latestRequestStatus: 'pending' | 'approved' | 'rejected' | null
  /**
   * Open follow-up cases, earliest question first: the overview picks the
   * ones due now for its banners (FU-02, В-2). Empty when they could not be read.
   */
  followups: FollowupCaseSummary[]
}

const HISTORY_LIMIT = 3

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
    // Each pet's newest check, found in the database (`latest_checks_by_pet`):
    // a window of the owner's newest checks would lose a pet checked rarely.
    service.rpc('latest_checks_by_pet', { p_user_id: userId }),
    loadDueByPet(service, userId, today),
  ])

  if (petsError) throw new Error(`pets: ${petsError.message}`)
  if (recentError) throw new Error(`recent pet checks: ${recentError.message}`)

  const latestChecksByPet: Record<string, PetLatestCheck> = {}
  for (const row of (recentPetChecks ?? []) as { pet_id: string; urgency: string; created_at: string }[]) {
    latestChecksByPet[row.pet_id] = {
      urgency: row.urgency as string,
      // Stored without a zone; read as UTC so no clock shifts it.
      created_at: toUtcIso(row.created_at as string),
    }
  }

  const rows = (pets ?? []) as Pet[]
  // A photo only decorates the row: links that cannot be signed leave the drawings.
  const urls = await signAvatars(service, rows.map((pet) => pet.avatar_path ?? null))
  const photosByPet: Record<string, string> = {}
  rows.forEach((pet, index) => {
    const url = urls[index]
    if (url) photosByPet[pet.id] = url
  })

  return { pets: rows, latestChecksByPet, dueByPet, photosByPet }
}

/**
 * Everything the overview renders besides the cabinet frame: pets, the
 * newest checks and the state of the extra-check request.
 */
export async function loadDashboard(userId: string, today: string): Promise<DashboardData> {
  const service = createServiceClient()

  const [overview, checksResult, latestRequestStatus, followups] = await Promise.all([
    loadPetsOverview(userId, today),
    service
      .from('symptom_checks')
      .select(symptomCheckSelect())
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    readExtraCheckRequestStatus(userId),
    loadActiveFollowups(userId),
  ])

  if (checksResult.error) throw new Error(`recent checks: ${checksResult.error.message}`)

  return {
    ...overview,
    checks: (checksResult.data ?? []).map(row => {
      const check = mapSymptomCheckRow(row as never)
      return { ...check, created_at: toUtcIso(check.created_at) }
    }),
    latestRequestStatus,
    followups,
  }
}
