import { z } from 'zod'
import { AccountStatusSchema, LocaleSchema, UserRoleSchema, UuidSchema } from './primitives'

/**
 * Everything `/api/v1/me` may return, and nothing else. The schema is strict on
 * purpose: if a handler ever spreads a Supabase user or a profiles row into the
 * response, parsing fails instead of shipping email, tokens or app_metadata to
 * the client.
 *
 * Balance is read-only here. It changes through the credit ledger, never
 * through a client write.
 */
export const PublicProfileSchema = z.strictObject({
  id: UuidSchema,
  locale: LocaleSchema,
  role: UserRoleSchema,
  credits: z.int().min(0),
  account_status: AccountStatusSchema,
  capabilities: z.strictObject({
    /** Purchases are switched off; the provider in the tree is a stub. */
    billing: z.boolean(),
    /** Asking for one more free check. */
    extra_check_request: z.boolean(),
  }),
})

export type PublicProfile = z.infer<typeof PublicProfileSchema>

/** The only profile fields a client may change. Never role, credits or status. */
export const ProfileUpdateInputSchema = z
  .strictObject({ locale: LocaleSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInputSchema>
