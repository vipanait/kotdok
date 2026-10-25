import { NextRequest } from 'next/server'
import { FollowupCaseListSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { listActiveFollowups } from '@/server/followup/followup-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

/**
 * Open cases, earliest question first. The phone builds its notifications from
 * this list, so they come back after a reinstall; the site shows banners.
 * Only `status=active` is served.
 */
export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const status = request.nextUrl.searchParams.get('status') ?? 'active'
  if (status !== 'active') return apiError(context.requestId, 'bad_request', 'Only status=active is served')

  const result = await listActiveFollowups(createServiceClient(), context.account.userId)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, FollowupCaseListSchema.parse({ items: result.data }))
})
