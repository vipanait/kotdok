import 'server-only'

import { UuidSchema } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/** The kinds of record `/pets/[id]/health/[recordId]` can open; a stage adds its own. */
export type HealthRecordKind = 'weight'

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
): Promise<HealthRecordKind | null> {
  if (!UuidSchema.safeParse(recordId).success) return null

  const { data, error } = await supabase
    .from('pet_weights')
    .select('id')
    .eq('id', recordId)
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(`Could not look the record up: ${error.message}`)
  return data ? 'weight' : null
}
