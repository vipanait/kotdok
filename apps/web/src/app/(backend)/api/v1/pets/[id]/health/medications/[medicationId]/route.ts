import { NextRequest } from 'next/server'
import { MedicationPatchSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { changeMedication, deleteMedication } from '@/server/medical-record/medication-service'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; medicationId: string }> }

async function readIds(params: Params): Promise<{ petId: string; medicationId: string } | null> {
  const { id, medicationId } = await params.params
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(medicationId).success) return null
  return { petId: id, medicationId }
}

/** A correction, or «Завершить курс»: `{ ended_on: today, ongoing: false }`. */
export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = MedicationPatchSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await changeMedication(createServiceClient(), context.account.userId, ids.petId, ids.medicationId, parsed.data)
  if (!result.ok) {
    if (result.reason === 'bad_range') return apiError(context.requestId, 'bad_request', 'The end is before the start')
    return serviceFailureResponse(context.requestId, result.reason)
  }
  return apiSuccess(context.requestId, result.data)
})

export const DELETE = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await deleteMedication(createServiceClient(), context.account.userId, ids.petId, ids.medicationId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiNoContent(context.requestId)
})
