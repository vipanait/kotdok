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

export type CabinetState =
  | { kind: 'open'; cabinet: CabinetUser }
  | { kind: 'signed_out' }
  /** Deletion has started: the session still works, the cabinet is closed. */
  | { kind: 'deleting' }

/**
 * Who is looking at the cabinet, and whether it is open to them. A profile
 * that cannot be read is an error, not a signed-out visitor: sending a live
 * session to sign-in would only bounce it back here.
 */
export async function loadCabinetState(): Promise<CabinetState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { kind: 'signed_out' }

  const account = await loadAccount(createServiceClient(), user.id)
  if (!account.ok) {
    if (account.reason === 'account_deleting') return { kind: 'deleting' }
    throw new Error('Could not read the signed-in account')
  }

  return {
    kind: 'open',
    cabinet: {
      user,
      email: user.email ?? '',
      credits: account.account.credits,
      isAdmin: account.account.role === 'admin',
    },
  }
}
