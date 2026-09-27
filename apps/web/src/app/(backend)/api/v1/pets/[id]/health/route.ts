import { UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getHealthOverview } from '@/server/medical-record/overview-service'
import { requestToday } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * The medical record of one pet. `?today=` is the owner's calendar day: the
 * pet form's list of medicines (`pet.medications`) is the courses current on
 * it (`requestToday`); without it, or outside the UTC days around the
 * server's, the server's UTC day, as before.
 */
export const GET = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  // A malformed id is answered like a missing pet, as on /pets/{id}.
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await getHealthOverview(createServiceClient(), context.account.userId, id, requestToday(request.nextUrl))
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data)
})
