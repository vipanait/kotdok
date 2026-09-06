import { z } from 'zod'

/**
 * Account deletion. The full cleanup is stage 8 and the user-facing flow is
 * stage 9; the contract is fixed here so both clients can be written against it.
 *
 * The client generates a random receipt secret before sending the request and
 * stores it apart from the session. The server keeps only its hash, so a lost
 * 202 response still leaves the client able to poll for status after its session
 * is gone.
 */
export const DELETION_RECEIPT_HEADER = 'X-Deletion-Receipt'

/** 32 bytes of client randomness, hex encoded. */
export const DeletionReceiptSecretSchema = z.string().regex(/^[0-9a-f]{64}$/)

export const AccountDeletionRequestSchema = z.strictObject({
  receipt_secret: DeletionReceiptSecretSchema,
  /**
   * Server-issued proof of a fresh re-authentication, bound to this user and
   * this operation. A refreshed access token or a client-side "confirmed" flag
   * does not qualify.
   */
  reauth_token: z.string().min(1),
})

export type AccountDeletionRequest = z.infer<typeof AccountDeletionRequestSchema>

export const AccountDeletionAcceptedSchema = z.strictObject({
  status: z.literal('accepted'),
})

export type AccountDeletionAccepted = z.infer<typeof AccountDeletionAcceptedSchema>

export const DELETION_STATUSES = ['pending', 'completed', 'action_required'] as const

/**
 * Deliberately minimal: no email, no user id, nothing about the data itself.
 * The receipt travels in a header, never in the URL, and the response is
 * served with Cache-Control: no-store.
 */
export const AccountDeletionStatusSchema = z.strictObject({
  status: z.enum(DELETION_STATUSES),
})

export type AccountDeletionStatus = z.infer<typeof AccountDeletionStatusSchema>

export const HealthSchema = z.strictObject({
  status: z.literal('ok'),
})

export type Health = z.infer<typeof HealthSchema>
