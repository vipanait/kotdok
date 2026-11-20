import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'
import {
  PD_CONSENT_LEGACY_VERSION,
  PD_CONSENT_VERSION,
  type AccountStatus,
  type Locale,
  type UserRole,
} from '@lapka/contracts'
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
  /**
   * The account owes the personal data consent its client asks for (see
   * `consentEdition`). Business operations wait until it has given it; the
   * profile, the consent itself and leaving do not.
   */
  pdConsentRequired: boolean
  /** Which rules `pdConsentRequired` was decided by. */
  consentEdition: ConsentEdition
}

/**
 * Which consent the caller's client asks for. `current`: the site and every
 * app that sends `consent-editions` — any account owes the current edition
 * until it has accepted it. `legacy`: an app build from before that, which
 * shows and sends 2026-09-26 — only an account created since 26 September 2026
 * owes a consent, and any edition settles it, as before the second edition.
 */
export type ConsentEdition = 'current' | 'legacy'

/** The edition a client of this kind shows and sends. */
export function consentVersionFor(edition: ConsentEdition): string {
  return edition === 'current' ? PD_CONSENT_VERSION : PD_CONSENT_LEGACY_VERSION
}

/** Whether a profile still owes the consent its client asks for. */
export function owesConsent(
  profile: { pd_consent_required: boolean | null; pd_consent_version: string | null },
  edition: ConsentEdition,
): boolean {
  // Editions are ISO dates: a later one than asked for settles it too.
  const accepted = profile.pd_consent_version
  if (edition === 'current') return !accepted || accepted < PD_CONSENT_VERSION
  return Boolean(profile.pd_consent_required) && !accepted
}

export type AccountLookupFailure =
  /** No profile row: the account never existed or has already been removed. */
  | { ok: false; reason: 'not_found' }
  /** Exists, but deletion has started; no business operation may proceed. */
  | { ok: false; reason: 'account_deleting' }

export type AccountLookup = { ok: true; account: AccountContext } | AccountLookupFailure

/**
 * The account a v1 request was authenticated as, for the rest of that request.
 *
 * The bearer check reads the profile, and then every service read it again to
 * guard itself — one more sequential trip to the database on every call, and
 * the database is an ocean away from the functions. Inside a request that has
 * already verified this user, `loadAccount` answers from here instead.
 * Nothing outlives the request: the store is scoped to the handler's call.
 */
const verifiedAccount = new AsyncLocalStorage<AccountContext>()

export function withVerifiedAccount<T>(account: AccountContext, run: () => T): T {
  return verifiedAccount.run(account, run)
}

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
  { consentEdition = 'current' }: { consentEdition?: ConsentEdition } = {},
): Promise<AccountLookup> {
  const known = verifiedAccount.getStore()
  if (known && known.userId === userId) return { ok: true, account: known }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, status, role, locale, credits, pd_consent_required, pd_consent_version')
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
      pdConsentRequired: owesConsent(data, consentEdition),
      consentEdition,
    },
  }
}
