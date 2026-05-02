import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { sanitizeCat } from '@/shared/utils/cat-utils'

type SupabaseService = ReturnType<typeof createServiceClient>

export async function listCats(supabase: SupabaseService, userId: string) {
  return supabase
    .from('cats')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50)
}

export async function createCat(
  supabase: SupabaseService,
  userId: string,
  body: Record<string, unknown>,
) {
  return supabase
    .from('cats')
    .insert({ ...sanitizeCat(body), user_id: userId })
    .select()
    .single()
}

export async function updateCat(
  supabase: SupabaseService,
  userId: string,
  catId: string,
  body: Record<string, unknown>,
) {
  return supabase
    .from('cats')
    .update(sanitizeCat(body))
    .eq('id', catId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .single()
}

export async function softDeleteCatAndChecks(
  supabase: SupabaseService,
  userId: string,
  catId: string,
) {
  const now = new Date().toISOString()
  const deletedCat = await supabase
    .from('cats')
    .update({ deleted_at: now })
    .eq('id', catId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .single()

  if (deletedCat.error || !deletedCat.data) return deletedCat

  const checks = await supabase
    .from('symptom_checks')
    .update({ deleted_at: now })
    .eq('cat_id', catId)
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (checks.error) {
    return { data: null, error: checks.error }
  }

  return deletedCat
}
