import 'server-only'

import { PD_CONSENT_VERSION, type ConsentInput, type ConsentStatus } from '@lapka/contracts'
import { loadAccount, type AccountContext } from '@/server/auth/account-state'
import { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/** What the account still owes, as the clients see it. */
export function consentStatus(account: AccountContext): ConsentStatus {
  return { required: account.pdConsentRequired, version: PD_CONSENT_VERSION }
}

export type RecordConsentResult = { ok: true } | { ok: false; reason: 'stale_version' | 'failed' }

/**
 * Stores consent to the current edition. Only the current one: a client that
 * showed an older text has not shown what is being agreed to now. Repeats are
 * harmless — one row per user and edition.
 */
export async function recordConsent(
  supabase: SupabaseService,
  userId: string,
  input: ConsentInput,
): Promise<RecordConsentResult> {
  if (input.version !== PD_CONSENT_VERSION) return { ok: false, reason: 'stale_version' }

  const { error } = await supabase
    .from('personal_data_consents')
    .upsert(
      { user_id: userId, version: input.version, source: input.source },
      { onConflict: 'user_id,version', ignoreDuplicates: true },
    )
  return error ? { ok: false, reason: 'failed' } : { ok: true }
}

/**
 * For the site's cookie-authenticated routes: the rule `withApiAuth` applies,
 * for the route to answer in its own `{ error }` shape. An account that cannot
 * be read is left to the route's own handling.
 */
export async function owesConsent(userId: string): Promise<boolean> {
  const account = await loadAccount(createServiceClient(), userId)
  return account.ok && account.account.pdConsentRequired
}
