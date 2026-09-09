import { z } from 'zod'
import { IsoDateTimeSchema } from './primitives'

/**
 * Account deletion. The full cleanup is stage 8 and the user-facing flow is
 * stage 9; the contract is fixed here so both clients can be written against it.
 *
 * The client generates a random receipt secret before sending the request and
 * stores it apart from the session. The server keeps only its hash, so a lost
 * 202 response still leaves the client able to poll for status after its session
 * is gone.
 */
/**
 * How long we say deletion takes, and how long the record of it is kept.
 *
 * Chosen by the owner on 9 September 2026, closing open question 1.8. Thirty
 * days is the usual published figure and lines up with the two anchors people
 * cite — one month under GDPR art. 12(3), thirty days under 152-ФЗ art. 21. In
 * practice the work takes minutes; the promise covers retries, an external
 * service being down, and backups rotating, not the speed of the happy path.
 *
 * The record outlives the promise by another thirty days so that somebody who
 * comes back after the deadline can still read their receipt and see that it
 * finished. It is deliberately not longer: the job is still a record about a
 * person who asked to be forgotten.
 *
 * Neither number belongs to the financial archive, which answers to retention
 * obligations rather than to us — see open question 1.7.
 */
export const DELETION_COMPLETION_DAYS = 30

export const DELETION_RECORD_RETENTION_DAYS = 60

export const DELETION_RECEIPT_HEADER = 'X-Deletion-Receipt'

/** 32 bytes of client randomness, hex encoded. */
export const DeletionReceiptSecretSchema = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * Operations a re-authentication proof can be minted for. One name, one
 * meaning: a proof issued for deleting an account must not open anything else,
 * and the list is closed so a typo cannot invent a new permission.
 */
export const REAUTH_OPERATIONS = ['account_deletion'] as const

export const ReauthOperationSchema = z.enum(REAUTH_OPERATIONS)

export type ReauthOperation = z.infer<typeof ReauthOperationSchema>

export const ReauthRequestSchema = z.strictObject({
  operation: ReauthOperationSchema,
})

export type ReauthRequest = z.infer<typeof ReauthRequestSchema>

/**
 * The proof, and when it stops being one.
 *
 * The token is returned once and never again: the server keeps only its hash,
 * so a client that loses it asks for another rather than recovering this one.
 */
export const ReauthProofSchema = z.strictObject({
  token: z.string().min(1),
  expires_at: IsoDateTimeSchema,
})

export type ReauthProof = z.infer<typeof ReauthProofSchema>

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
