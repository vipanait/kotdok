import { NextRequest } from 'next/server'
import { MedicationDoseInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { markDose, unmarkDose, type DoseFailure } from '@/server/medical-record/dose-service'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; medicationId: string }> }

/**
 * «Дали» (FB-5). POST marks a dose — 201 when new, 200 with the same dose
 * when it was marked already; DELETE `?taken_on&slot` takes the mark back.
 */

function failure(requestId: string, reason: DoseFailure) {
  if (reason === 'not_found') return apiError(requestId, 'not_found', 'No such resource')
  if (reason === 'bad_slot') return apiError(requestId, 'bad_request', 'The course is not given at that time')
  if (reason === 'future') return apiError(requestId, 'bad_request', 'A dose cannot be given in the future')
  if (reason === 'bad_day') return apiError(requestId, 'bad_request', 'The course is not given on that day, or it is too long ago')
  return apiError(requestId, 'internal_error', 'Storage is unavailable')
}

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, medicationId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(medicationId, context)
  if (refused) return refused
  const parsed = await readJson(request, MedicationDoseInputSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await markDose(createServiceClient(), context.account.userId, id, medicationId, parsed.data)
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.dose, result.created ? 201 : 200)
})

export const DELETE = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, medicationId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(medicationId, context)
  if (refused) return refused
  const parsed = MedicationDoseInputSchema.safeParse({
    taken_on: request.nextUrl.searchParams.get('taken_on'),
    slot: request.nextUrl.searchParams.get('slot'),
  })
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'taken_on and slot are required')

  const result = await unmarkDose(createServiceClient(), context.account.userId, id, medicationId, parsed.data)
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiNoContent(context.requestId)
})
