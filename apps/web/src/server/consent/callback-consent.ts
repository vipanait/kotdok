import 'server-only'

import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { loadAccount } from '@/server/auth/account-state'
import { recordConsent } from '@/server/consent/consent-service'
import { createServiceClient } from '@/server/supabase/server'

/**
 * After a provider sign-in: if the registration page's box was ticked (the
 * cookie carries the edition) and the account still owes consent, record it.
 * Anything else — no cookie, another edition, an account that owes nothing or
 * cannot be read — records nothing; the /consent page catches whoever is left.
 */
export async function recordProviderConsent(cookieValue: string | undefined, userId: string): Promise<void> {
  if (cookieValue !== PD_CONSENT_VERSION) return

  const supabase = createServiceClient()
  const account = await loadAccount(supabase, userId)
  if (!account.ok || !account.account.pdConsentRequired) return

  await recordConsent(supabase, userId, { version: PD_CONSENT_VERSION, source: 'web' })
}
