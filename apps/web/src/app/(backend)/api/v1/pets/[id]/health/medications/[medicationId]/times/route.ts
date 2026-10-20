import { NextRequest } from 'next/server'
import { MedicationTimesSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { setMedicationTimes } from '@/server/medical-record/medication-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; medicationId: string }> }

/** The times a course is given at (FB-5): the list replaces the one stored. Answers with the course. */
export const PUT = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, medicationId } = await params.params
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(medicationId).success) {
    return apiError(context.requestId, 'not_found', 'No such resource')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }
  const parsed = MedicationTimesSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await setMedicationTimes(createServiceClient(), context.account.userId, id, medicationId, parsed.data.reminder_times)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.data)
})
