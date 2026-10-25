import { NextRequest } from 'next/server'
import { CheckFollowupSchema, FollowupEnableInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getCheckFollowup, setCheckFollowup } from '@/server/followup/followup-service'
import { apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * The follow-up of one check: whether the result may offer «Напомнить, как …?»
 * and the case the check belongs to. A separate resource rather than fields on
 * the check, whose schema installed builds read strictly.
 */
export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

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
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const parsed = await readJson(request, FollowupEnableInputSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await setCheckFollowup(createServiceClient(), context.account.userId, id, parsed.data)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, CheckFollowupSchema.parse(result.data))
})
