import { CheckFeedbackSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getCheckFeedback } from '@/server/feedback/feedback-service'
import { apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const result = await getCheckFeedback(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, CheckFeedbackSchema.parse({ rating: result.rating }))
})
