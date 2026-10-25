import { NextRequest } from 'next/server'
import { MedicationTimesSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { setMedicationTimes } from '@/server/medical-record/medication-service'
import { apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; medicationId: string }> }

/** The times a course is given at (FB-5): the list replaces the one stored. Answers with the course. */
export const PUT = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, medicationId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(medicationId, context)
  if (refused) return refused

  const parsed = await readJson(request, MedicationTimesSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await setMedicationTimes(createServiceClient(), context.account.userId, id, medicationId, parsed.data.reminder_times)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.data)
})
