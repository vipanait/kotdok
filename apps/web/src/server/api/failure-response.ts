import 'server-only'

import type { NextResponse } from 'next/server'
import { apiError } from '@/server/api/response'

/** Failure reasons the product services share. */
export type ServiceFailure =
  | 'account_deleting'
  | 'account_not_found'
  | 'not_found'
  | 'bad_cursor'
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
    default:
      return apiError(requestId, 'internal_error', 'Storage is unavailable')
  }
}
