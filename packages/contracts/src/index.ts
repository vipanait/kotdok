// Contracts shared by the web app and the Expo client.
//
// Skeleton only: the request/response schemas, the error codes and the
// generated OpenAPI document land in stage 1 of the plan. Nothing here may
// import Next.js, a server SDK or anything from the DOM.

/** Path prefix every mobile-facing route lives under. */
export const API_VERSION = 'v1' as const

/** Shape every failing v1 response uses. Fields are fixed in stage 1. */
export type ApiErrorEnvelope = {
  error: {
    code: string
    message: string
    request_id: string
    details?: unknown
  }
}
