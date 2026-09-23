import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'

export interface CabinetUser {
  user: User
  email: string
  credits: number
  isAdmin: boolean
}

/**
 * What every cabinet page needs for its frame: who is signed in, the balance
 * shown in the sidebar, and whether to offer the statistics link.
 *
 * `null` for a visitor who may not see the cabinet — signed out, or an account
 * whose deletion has started. Where to send them is the page's call.
 */
export async function loadCabinetUser(): Promise<CabinetUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceClient()
  const account = await loadAccount(service, user.id)
  if (!account.ok) return null

  return {
    user,
    email: user.email ?? '',
    credits: account.account.credits,
    isAdmin: account.account.role === 'admin',
  }
}
