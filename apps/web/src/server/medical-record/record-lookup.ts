import 'server-only'

import { UuidSchema, type HealthEvent } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/** The kinds of record `/pets/[id]/health/[recordId]` can open; a stage adds its own. */
export type HealthRecordKind = 'weight' | HealthEvent['kind']

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

  const [weight, event] = await Promise.all([
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
  ])

  if (weight.error) throw new Error(`Could not look the record up: ${weight.error.message}`)
  if (event.error) throw new Error(`Could not look the record up: ${event.error.message}`)
  if (weight.data) return { kind: 'weight', status: null }
  if (event.data) {
    const row = event.data as { kind: HealthEvent['kind']; status: HealthEvent['status'] }
    return { kind: row.kind, status: row.status }
  }
  return null
}
