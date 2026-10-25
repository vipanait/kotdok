import { FollowupCaseSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getFollowupCase } from '@/server/followup/followup-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ caseId: string }> }

/** One case with its timeline. Someone else's case is 404, as one that never existed. */
export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { caseId } = await params.params
  if (!UuidSchema.safeParse(caseId).success) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await getFollowupCase(createServiceClient(), context.account.userId, caseId)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, FollowupCaseSchema.parse(result.data))
})
