import { NextRequest } from 'next/server'
import { FollowupCaseSummarySchema, FollowupSnoozeInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { snoozeFollowup } from '@/server/followup/followup-service'
import { apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ caseId: string }> }

/**
 * «Скрыть до завтра». The client sends its own tomorrow morning; the case stays
 * open and banners, cards and the notification wait until then.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { caseId } = await params.params
  const refused = readUuidParam(caseId, context)
  if (refused) return refused

  const parsed = await readJson(request, FollowupSnoozeInputSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await snoozeFollowup(createServiceClient(), context.account.userId, caseId, new Date(parsed.data.until))
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, FollowupCaseSummarySchema.parse(result.data))
})
