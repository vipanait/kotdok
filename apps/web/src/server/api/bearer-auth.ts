import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { loadAccount, type AccountContext } from '@/server/auth/account-state'

/**
 * Authentication for /api/v1.
 *
 * These routes accept a Bearer access token and nothing else. Cookies are never
 * read here: a malformed or foreign Bearer must fail, not quietly fall back to
 * whatever session the browser happens to be carrying. The old web routes keep
 * their cookie and CSRF adapter; the two paths do not mix.
 */

export type AuthFailure =
  /** No Authorization header, or it is not a Bearer token. */
  | { ok: false; reason: 'missing_token' }
  /** Supabase rejected the token: malformed, expired, or issued elsewhere. */
  | { ok: false; reason: 'invalid_token' }
  /** Token verified, but the account is gone or being deleted. */
  | { ok: false; reason: 'account_deleting' }
  | { ok: false; reason: 'account_not_found' }

export type AuthResult = { ok: true; account: AccountContext } | AuthFailure

/** Bearer only, case-insensitive scheme, exactly one space, non-empty token. */
export function readBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null

  const match = /^Bearer[ ]([^\s]+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/**
 * Verifies the token against Supabase and then loads the account. The user id
 * comes only from the verified session — never from the request body, a query
 * parameter or a header the caller controls.
 */
export async function authenticateBearer(request: NextRequest): Promise<AuthResult> {
  const token = readBearerToken(request)
  if (!token) return { ok: false, reason: 'missing_token' }

  // A fresh client per request with no session persistence: nothing here may
  // pick up cookies or leak one caller's session into another's.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  )

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { ok: false, reason: 'invalid_token' }

  const account = await loadAccount(createServiceClient(), data.user.id)
  if (!account.ok) {
    return account.reason === 'account_deleting'
      ? { ok: false, reason: 'account_deleting' }
      : { ok: false, reason: 'account_not_found' }
  }

  return { ok: true, account: account.account }
}
