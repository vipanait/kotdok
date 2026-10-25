import { NextRequest } from 'next/server'
import { CheckFollowupSchema, FollowupEnableInputSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getCheckFollowup, setCheckFollowup } from '@/server/followup/followup-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * The follow-up of one check: whether the result may offer «Напомнить, как …?»
 * and the case the check belongs to. A separate resource rather than fields on
 * the check, whose schema installed builds read strictly.
 */
export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await getCheckFollowup(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, CheckFollowupSchema.parse(result.data))
})

/**
 * Switches the reminder on or off. Repeating a call changes nothing. 409
 * `conflict` when the check cannot be followed: healthy, without a pet, older
 * than twelve hours, a re-check of another case.
 */
export const PUT = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }
  const parsed = FollowupEnableInputSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await setCheckFollowup(createServiceClient(), context.account.userId, id, parsed.data)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, CheckFollowupSchema.parse(result.data))
})
