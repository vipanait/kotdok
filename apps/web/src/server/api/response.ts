import 'server-only'

import { NextResponse } from 'next/server'
import { ERROR_STATUS, type ErrorCode } from '@lapka/contracts'

/**
 * Every v1 response goes through here, so the envelope, the request id and the
 * cache headers cannot be forgotten by a single route.
 */

export const REQUEST_ID_HEADER = 'x-request-id'

export function newRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Private data must never land in a shared CDN cache, so every v1 response is
 * marked no-store — including the errors, which can differ per user.
 */
function withCommonHeaders(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId)
  response.headers.set('cache-control', 'private, no-store')
  return response
}

export function apiSuccess(requestId: string, body: unknown, status = 200): NextResponse {
  return withCommonHeaders(NextResponse.json(body, { status }), requestId)
}

export function apiNoContent(requestId: string): NextResponse {
  return withCommonHeaders(new NextResponse(null, { status: 204 }), requestId)
}

/**
 * The message is for a human reading a log or a bug report; clients branch on
 * the code. Nothing user-supplied — no symptom text, no file contents — belongs
 * in it.
 */
export function apiError(
  requestId: string,
  code: ErrorCode,
  message: string,
  details?: unknown,
): NextResponse {
  return withCommonHeaders(
    NextResponse.json(
      { error: { code, message, request_id: requestId, ...(details === undefined ? {} : { details }) } },
      { status: ERROR_STATUS[code] },
    ),
    requestId,
  )
}
