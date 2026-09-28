import 'server-only'

import { UuidSchema, type HealthEvent } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { courseOverEverywhere } from './medication-service'

type SupabaseService = ReturnType<typeof createServiceClient>

/** The kinds of record `/pets/[id]/health/[recordId]` can open; a stage adds its own. */
export type HealthRecordKind = 'weight' | 'medication' | HealthEvent['kind']

/**
 * What a record id is: a weighing (no status), or a record of the event
 * table with its kind and whether it was done or is planned. The status
 * decides whether the edit address may show a form: a done procedure is
 * only read (owner rule of 26 September 2026).
 */
export type HealthRecordRef =
  | { kind: 'weight'; status: null }
  | { kind: HealthEvent['kind']; status: HealthEvent['status'] }
  /**
   * A medication course. `finished` when it has ended for every owner
   * wherever they are (`courseOverEverywhere`): the server does not know the
   * owner's day, so a course ended today may still be `current` here — the
   * page then checks it by the owner's own day.
   */
  | { kind: 'medication'; status: 'current' | 'finished' }

/**
 * What a record id under a pet is, or null: a malformed id, a record of
 * another pet or another owner, and a deleted one are all "nothing here".
 * Sections are static routes beside `[recordId]`, and a record id is a
 * UUID, so a section name never reaches this.
 */
export async function findHealthRecord(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  recordId: string,
): Promise<HealthRecordRef | null> {
  if (!UuidSchema.safeParse(recordId).success) return null

  const [weight, event, course] = await Promise.all([
    supabase
      .from('pet_weights')
      .select('id')
      .eq('id', recordId)
      .eq('pet_id', petId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('pet_health_events')
      .select('id, kind, status')
      .eq('id', recordId)
      .eq('pet_id', petId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('pet_medications')
      .select('id, ended_on')
      .eq('id', recordId)
      .eq('pet_id', petId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle(),
  ])

  if (weight.error) throw new Error(`Could not look the record up: ${weight.error.message}`)
  if (event.error) throw new Error(`Could not look the record up: ${event.error.message}`)
  if (course.error) throw new Error(`Could not look the record up: ${course.error.message}`)
  if (weight.data) return { kind: 'weight', status: null }
  if (event.data) {
    const row = event.data as { kind: HealthEvent['kind']; status: HealthEvent['status'] }
    return { kind: row.kind, status: row.status }
  }
  if (course.data) {
    const row = course.data as { ended_on: string | null }
    return { kind: 'medication', status: courseOverEverywhere(row) ? 'finished' : 'current' }
  }
  return null
}
