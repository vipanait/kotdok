import { NextRequest } from 'next/server'
import { UuidSchema, WeightInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { isFutureDay, recordWeight } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/** A weighing for a day. A second one for the same day replaces that day's value. */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = WeightInputSchema.safeParse(body)
  if (!parsed.success || isFutureDay(parsed.data.measured_on)) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  // withApiAuth has refused inactive accounts; the table's late-write trigger
  // covers an account that starts deleting mid-request.
  const supabase = createServiceClient()
  const result = await recordWeight(supabase, context.account.userId, id, parsed.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data, 201)
})
