import { z } from 'zod'

/**
 * The current edition of the consent text: the one /legal/personal-data shows
 * and every account is asked for. A new edition changes this, the page and
 * `public.pd_consent_version_is_current` together, and moves the edition it
 * replaces into PD_CONSENT_LEGACY_VERSION.
 *
 * A merge deploys the server at once, while installed apps keep the edition
 * compiled into them. So the server tells clients apart by
 * CONSENT_EDITIONS_FEATURE: a client that sends it is asked for this edition
 * and sends the `version` GET /consent returns; a build from before it keeps
 * the old rules (see PD_CONSENT_LEGACY_VERSION), so its consent screen is never
 * refused as stale.
 */
export const PD_CONSENT_VERSION = '2026-11-20'

/**
 * The edition apps from before CONSENT_EDITIONS_FEATURE send. The server still
 * accepts it, and asks such a build only for what it asked before: a consent
 * from an account created since 26 September 2026, to any edition.
 */
export const PD_CONSENT_LEGACY_VERSION = '2026-09-26'

/**
 * Sent in X-Lapka-Features by every client that asks for the current edition
 * and sends the version GET /consent names.
 */
export const CONSENT_EDITIONS_FEATURE = 'consent-editions'

export const ConsentSourceSchema = z.enum(['web', 'ios', 'android'])
export type ConsentSource = z.infer<typeof ConsentSourceSchema>

/** Whether this account still has to consent, and to which edition. */
export const ConsentStatusSchema = z.strictObject({
  required: z.boolean(),
  version: z.string().min(1),
})
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>

/** Consent to one edition, given on one of the clients. */
export const ConsentInputSchema = z.strictObject({
  version: z.string().min(1).max(32),
  source: ConsentSourceSchema,
})
export type ConsentInput = z.infer<typeof ConsentInputSchema>
