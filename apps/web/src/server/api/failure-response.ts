import 'server-only'

import type { NextResponse } from 'next/server'
import { apiError } from '@/server/api/response'

/** Failure reasons the product services share. */
export type ServiceFailure =
  | 'account_deleting'
  | 'account_not_found'
  | 'not_found'
  | 'bad_cursor'
  | 'conflict'
  /** The body passed the contract but not the row it lands on (a database check). */
  | 'invalid'
  | 'storage_error'

/**
 * One mapping for every v1 route, so two routes cannot disagree about what a
 * missing account or someone else's row means.
 */
export function serviceFailureResponse(requestId: string, reason: ServiceFailure): NextResponse {
  switch (reason) {
    case 'account_deleting':
      return apiError(requestId, 'account_deleting', 'Account is being deleted')
    case 'account_not_found':
      return apiError(requestId, 'unauthorized', 'Access token is not valid')
    case 'not_found':
      return apiError(requestId, 'not_found', 'No such resource')
    case 'bad_cursor':
      return apiError(requestId, 'bad_request', 'Cursor is not valid')
    case 'conflict':
      return apiError(requestId, 'conflict', 'Conflicts with an existing record')
    case 'invalid':
      return apiError(requestId, 'bad_request', 'Body does not match the stored record')
    default:
      return apiError(requestId, 'internal_error', 'Storage is unavailable')
  }
}

/** The shared mapping, plus the rate limit some services report as a reason. */
export function serviceOrRateFailureResponse(requestId: string, reason: ServiceFailure | 'too_many_requests'): NextResponse {
  if (reason === 'too_many_requests') return apiError(requestId, 'rate_limited', 'Too many requests')
  return serviceFailureResponse(requestId, reason)
}
