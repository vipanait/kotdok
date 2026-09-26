import { createServiceClient } from '@/server/supabase/server'
import { listDue } from '@/server/medical-record/event-service'
import { apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

/** Every due date of the caller's pets, soonest first: one request for the whole pet list. */
export const GET = withApiAuth(async (_request, context: ApiContext) => {
  const result = await listDue(createServiceClient(), context.account.userId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.data)
})
