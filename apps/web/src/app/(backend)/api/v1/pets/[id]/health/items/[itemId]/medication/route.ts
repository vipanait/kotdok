import { createServiceClient } from '@/server/supabase/server'
import { prescriptionToMedication } from '@/server/medical-record/visit-service'
import { requestToday } from '@/server/medical-record/weight-service'
import { apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; itemId: string }> }

/**
 * «Добавить в лекарства» on a prescription: a course from the visit's day.
 * Twice adds it once. The pet form's list follows, counted from the owner's
 * `?today=` (`requestToday`).
 */
export const POST = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const { id, itemId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(itemId, context)
  if (refused) return refused

  const result = await prescriptionToMedication(createServiceClient(), context.account.userId, id, itemId, requestToday(request.nextUrl))
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, { medication_id: result.data }, 201)
})
