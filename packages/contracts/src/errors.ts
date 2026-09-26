import { z } from 'zod'

/**
 * Stable error codes. Clients branch on the code, never on the message text,
 * so a code may be added but never renamed or repurposed within v1.
 */
export const ERROR_CODES = {
  bad_request: 'bad_request',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
  insufficient_credits: 'insufficient_credits',
  payload_too_large: 'payload_too_large',
  unsupported_media_type: 'unsupported_media_type',
  rate_limited: 'rate_limited',
  account_deleting: 'account_deleting',
  /**
   * The account has not consented to personal-data processing, or not to the
   * current edition of the text. The client's next move is the consent screen.
   */
  consent_required: 'consent_required',
  /**
   * The session is valid, but the person authenticated too long ago for what
   * they are asking. The client's next move is to re-authenticate, which is a
   * different thing from signing in again — hence its own code rather than
   * `unauthorized`.
   */
  reauth_required: 'reauth_required',
  /**
   * The record is a procedure that was done (a vaccination or a treatment),
   * a vet visit that happened, or a finished medication course: it is history and can be read or deleted, never changed (owner rule of
   * 26 September 2026). Its own code, not `conflict`: nothing the client
   * sends again will be accepted, and the client's next move is to show the
   * record, not to offer a retry.
   */
  record_done: 'record_done',
  dependency_unavailable: 'dependency_unavailable',
  internal_error: 'internal_error',
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export const ErrorCodeSchema = z.enum(
  Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]],
)

/** HTTP status each code is served with. One code, one status. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  insufficient_credits: 402,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  account_deleting: 403,
  consent_required: 403,
  reauth_required: 401,
  record_done: 409,
  dependency_unavailable: 503,
  internal_error: 500,
}

export const ApiErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1),
    request_id: z.string().min(1),
    details: z.unknown().optional(),
  }),
})

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>
