import 'server-only'

import {
  PD_CONSENT_LEGACY_VERSION,
  PD_CONSENT_VERSION,
  type ConsentInput,
  type ConsentStatus,
} from '@lapka/contracts'
import { consentVersionFor, type AccountContext } from '@/server/auth/account-state'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/** The editions the server records: the current one, and the one older app builds still show. */
const ACCEPTED_VERSIONS: readonly string[] = [PD_CONSENT_VERSION, PD_CONSENT_LEGACY_VERSION]

/** What the account still owes, as its client sees it: the edition that client shows. */
export function consentStatus(account: AccountContext): ConsentStatus {
  return { required: account.pdConsentRequired, version: consentVersionFor(account.consentEdition) }
}

export type RecordConsentResult = { ok: true } | { ok: false; reason: 'stale_version' | 'failed' }

/**
 * Stores consent to an edition the server still accepts: the current one, or
 * 2026-09-26 from an app build that shows only that text. The edition stored is
 * the one the client says it showed; an account asked for the current edition
 * goes on owing it until it sends that one. Repeats are harmless — one row per
 * user and edition.
 */
export async function recordConsent(
  supabase: SupabaseService,
  userId: string,
  input: ConsentInput,
): Promise<RecordConsentResult> {
  if (!ACCEPTED_VERSIONS.includes(input.version)) return { ok: false, reason: 'stale_version' }

  const { error } = await supabase
    .from('personal_data_consents')
    .upsert(
      { user_id: userId, version: input.version, source: input.source },
      { onConflict: 'user_id,version', ignoreDuplicates: true },
    )
  return error ? { ok: false, reason: 'failed' } : { ok: true }
}
