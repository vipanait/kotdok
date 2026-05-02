import 'server-only'

import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/server/supabase/server'
import type { Profile } from '@/shared/types'

export interface AdminAuthContext {
  user: User
  profile: Pick<Profile, 'id' | 'role'>
}

export async function requireAdminUser(nextPath = '/admin/statistics'): Promise<AdminAuthContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  }

  const service = createServiceClient()
  const { data: profile, error } = await service
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (error || profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  return { user, profile: profile as Pick<Profile, 'id' | 'role'> }
}
