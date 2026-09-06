import 'server-only'

import type { NextRequest, NextResponse } from 'next/server'
import type { AccountContext } from '@/server/auth/account-state'
import { authenticateBearer, type AuthFailure } from '@/server/api/bearer-auth'
import { apiError, newRequestId } from '@/server/api/response'

/**
 * What a v1 handler is given. Everything about the caller is derived from the
 * verified token; a `user_id` in the body or the query is data, never identity.
 */
export type ApiContext = {
  requestId: string
  account: AccountContext
}

export type ApiHandler<T> = (
  request: NextRequest,
  context: ApiContext,
  params: T,
) => Promise<NextResponse> | NextResponse

function failureResponse(requestId: string, failure: AuthFailure): NextResponse {
  switch (failure.reason) {
    case 'account_deleting':
      return apiError(requestId, 'account_deleting', 'Account is being deleted')
    case 'account_not_found':
      // Deliberately the same answer as a bad token: whether an account exists
      // is not something an unauthenticated caller gets to learn.
      return apiError(requestId, 'unauthorized', 'Access token is not valid')
    default:
      return apiError(requestId, 'unauthorized', 'Access token is missing or not valid')
  }
}

/**
 * Wraps a v1 route: authenticates, refuses anything but an active account, and
 * gives the handler a request id it does not have to invent.
 */
export function withApiAuth<T = unknown>(handler: ApiHandler<T>) {
  return async (request: NextRequest, params: T): Promise<NextResponse> => {
    const requestId = newRequestId()

    const auth = await authenticateBearer(request)
    if (!auth.ok) return failureResponse(requestId, auth)

    try {
      return await handler(request, { requestId, account: auth.account }, params)
    } catch (error) {
      // Never let a stack or a driver message reach the client.
      console.error(`[${requestId}] unhandled API error:`, error)
      return apiError(requestId, 'internal_error', 'Unexpected server error')
    }
  }
}

/** For a handler that only an admin may reach. */
export function requireAdmin(context: ApiContext): NextResponse | null {
  if (context.account.role === 'admin') return null
  return apiError(context.requestId, 'forbidden', 'Administrator role required')
}
