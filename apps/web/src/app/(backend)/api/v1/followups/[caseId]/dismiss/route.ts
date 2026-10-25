import { FollowupCaseSummarySchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { dismissFollowup } from '@/server/followup/followup-service'
import { apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ caseId: string }> }

/** «Не напоминать больше»: closes an open case with no medical outcome. 409 if it is not open. */
export const POST = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { caseId } = await params.params
  const refused = readUuidParam(caseId, context)
  if (refused) return refused

  const result = await dismissFollowup(createServiceClient(), context.account.userId, caseId)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, FollowupCaseSummarySchema.parse(result.data))
})
