import 'server-only'

import type { AccountStatus, Locale, UserRole } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * The verified caller a service works with. Built from a checked session plus
 * the account row — never from a request body, and never carrying anything the
 * caller sent about themselves.
 */
export type AccountContext = {
  userId: string
  status: AccountStatus
  role: UserRole
  locale: Locale
  credits: number
}

export type AccountLookupFailure =
  /** No profile row: the account never existed or has already been removed. */
  | { ok: false; reason: 'not_found' }
  /** Exists, but deletion has started; no business operation may proceed. */
  | { ok: false; reason: 'account_deleting' }

export type AccountLookup = { ok: true; account: AccountContext } | AccountLookupFailure

/**
 * The one place that decides whether an account may act. Every service goes
 * through it, so a new operation cannot forget the deletion check.
 *
 * The status column is not writable with a user token; only a trusted server
 * moves an account to `deleting`.
 */
export async function loadAccount(
  supabase: SupabaseService,
  userId: string,
): Promise<AccountLookup> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, status, role, locale, credits')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return { ok: false, reason: 'not_found' }
  if (data.status !== 'active') return { ok: false, reason: 'account_deleting' }

  return {
    ok: true,
    account: {
      userId: data.id,
      status: data.status,
      role: data.role,
      locale: data.locale,
      credits: data.credits ?? 0,
    },
  }
}
