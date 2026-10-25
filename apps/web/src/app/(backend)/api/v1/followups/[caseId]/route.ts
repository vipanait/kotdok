import { FollowupCaseSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getFollowupCase } from '@/server/followup/followup-service'
import { apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ caseId: string }> }

/** One case with its timeline. Someone else's case is 404, as one that never existed. */
export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { caseId } = await params.params
  const refused = readUuidParam(caseId, context)
  if (refused) return refused

  const result = await getFollowupCase(createServiceClient(), context.account.userId, caseId)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, FollowupCaseSchema.parse(result.data))
})
