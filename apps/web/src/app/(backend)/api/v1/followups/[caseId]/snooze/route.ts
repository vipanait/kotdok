import { NextRequest } from 'next/server'
import { FollowupCaseSummarySchema, FollowupSnoozeInputSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { snoozeFollowup } from '@/server/followup/followup-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ caseId: string }> }

/**
 * «Скрыть до завтра». The client sends its own tomorrow morning; the case stays
 * open and banners, cards and the notification wait until then.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { caseId } = await params.params
  if (!UuidSchema.safeParse(caseId).success) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }
  const parsed = FollowupSnoozeInputSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await snoozeFollowup(createServiceClient(), context.account.userId, caseId, new Date(parsed.data.until))
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, FollowupCaseSummarySchema.parse(result.data))
})
