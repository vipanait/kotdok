import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/server/supabase/server'
import type { Profile } from '@/shared/types'

export interface AdminAuthContext {
  user: User
  profile: Pick<Profile, 'id' | 'role'>
}

/**
 * Why an admin page may not be shown. The page turns this into a redirect; the
 * service only decides.
 */
export type AdminAuthDenial =
  | { ok: false; reason: 'signed_out' }
  | { ok: false; reason: 'not_admin' }

export type AdminAuthResult = ({ ok: true } & AdminAuthContext) | AdminAuthDenial

export async function loadAdminUser(): Promise<AdminAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { ok: false, reason: 'signed_out' }

  const service = createServiceClient()
  const { data: profile, error } = await service
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (error || profile?.role !== 'admin') return { ok: false, reason: 'not_admin' }

  return { ok: true, user, profile: profile as Pick<Profile, 'id' | 'role'> }
}
