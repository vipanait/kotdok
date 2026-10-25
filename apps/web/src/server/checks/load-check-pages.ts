import 'server-only'

import type { SymptomCheckRecord } from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import { createServiceClient } from '@/server/supabase/server'
import { mapSymptomCheckRow, symptomCheckSelect } from '@/server/symptom-check/map-symptom-check'
import type { CheckPet } from '@/shared/types'

const PET_COLUMNS = 'id, name, species, breed, age_years, birth_date, chronic_conditions'

type MappableRow = Parameters<typeof mapSymptomCheckRow>[0]

function toRecord(row: unknown): SymptomCheckRecord {
  const record = mapSymptomCheckRow(row as MappableRow)
  // Some rows carry a timestamp without a zone; dates on screen must not shift.
  return { ...record, created_at: toUtcIso(record.created_at) }
}

/** The signed-in owner's pets, oldest first — the order of the cabinet. */
export async function loadCheckPets(userId: string): Promise<CheckPet[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('pets')
    .select(PET_COLUMNS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  // A failed read must reach the error page, not pass for "no pets yet".
  if (error) throw new Error(`Could not load pets: ${error.message}`)
  return (data ?? []) as CheckPet[]
}

/**
 * One saved result, only if it belongs to this user and was not deleted, with
 * the pet's current profile when the pet is still there.
 */
export async function loadCheckResult(
  userId: string,
  checkId: string,
): Promise<{ check: SymptomCheckRecord; pet: CheckPet | null } | null> {
  const service = createServiceClient()
  const { data: row, error } = await service
    .from('symptom_checks')
    .select(symptomCheckSelect())
    .eq('id', checkId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  // No such row (or not this user's) is a 404; a failed read is an error.
  if (error && error.code !== '22P02') throw new Error(`Could not load the check: ${error.message}`)
  if (!row) return null

  const check = toRecord(row)
  if (!check.pet_id) return { check, pet: null }

  const { data: pet } = await service
    .from('pets')
    .select(PET_COLUMNS)
    .eq('id', check.pet_id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  return { check, pet: (pet as CheckPet | null) ?? null }
}

/** One of the owner's live pets by id, as the history page names it; null when it is not theirs. */
export async function loadCheckPet(userId: string, petId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await createServiceClient()
    .from('pets')
    .select('id, name')
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`Could not load the pet: ${error.message}`)
  return (data as { id: string; name: string } | null) ?? null
}

/**
 * The most checks the history page lists. A page of rows, not an archive:
 * nobody is near it (checks are credits), and the API pages its history.
 */
export const CHECK_HISTORY_LIMIT = 200

/**
 * The newest saved results of this user — or, with `petId`, of that one pet —
 * newest first, at most `CHECK_HISTORY_LIMIT`, each without the model's full
 * answer: the page lists them and links to each.
 */
export async function loadCheckHistory(userId: string, petId: string | null = null): Promise<SymptomCheckRecord[]> {
  const service = createServiceClient()
  let query = service
    .from('symptom_checks')
    .select(symptomCheckSelect({ fullResponse: false }))
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (petId) query = query.eq('pet_id', petId)
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHECK_HISTORY_LIMIT)
  // A failed read must reach the error page, not pass for an empty history.
  if (error) throw new Error(`Could not load check history: ${error.message}`)
  return (data ?? []).map(toRecord)
}
