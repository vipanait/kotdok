import { z } from 'zod'

/**
 * The edition of the consent text a client shows and sends. A new edition
 * changes this, the page at /legal/personal-data and
 * `public.pd_consent_version_is_current` together.
 */
export const PD_CONSENT_VERSION = '2026-09-26'

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
