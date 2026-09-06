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
