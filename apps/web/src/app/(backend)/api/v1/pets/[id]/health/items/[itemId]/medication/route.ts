import { UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { prescriptionToMedication } from '@/server/medical-record/visit-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; itemId: string }> }

/** «Добавить в лекарства» on a prescription: a course from the visit's day. Twice adds it once. */
export const POST = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id, itemId } = await params.params
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(itemId).success) {
    return apiError(context.requestId, 'not_found', 'No such resource')
  }

  const result = await prescriptionToMedication(createServiceClient(), context.account.userId, id, itemId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, { medication_id: result.data }, 201)
})
