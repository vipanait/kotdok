import { NextRequest } from 'next/server'
import { MedicationDoseInputSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { markDose, unmarkDose, type DoseFailure } from '@/server/medical-record/dose-service'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; medicationId: string }> }

/**
 * «Дали» (FB-5). POST marks a dose — 201 when new, 200 with the same dose
 * when it was marked already; DELETE `?taken_on&slot` takes the mark back.
 */

async function readIds(params: Params) {
  const { id, medicationId } = await params.params
  return UuidSchema.safeParse(id).success && UuidSchema.safeParse(medicationId).success ? { petId: id, medicationId } : null
}

function failure(requestId: string, reason: DoseFailure) {
  if (reason === 'not_found') return apiError(requestId, 'not_found', 'No such resource')
  if (reason === 'bad_slot') return apiError(requestId, 'bad_request', 'The course is not given at that time')
  if (reason === 'future') return apiError(requestId, 'bad_request', 'A dose cannot be given in the future')
  return apiError(requestId, 'internal_error', 'Storage is unavailable')
}

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }
  const parsed = MedicationDoseInputSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await markDose(createServiceClient(), context.account.userId, ids.petId, ids.medicationId, parsed.data)
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.dose, result.created ? 201 : 200)
})

export const DELETE = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')
  const parsed = MedicationDoseInputSchema.safeParse({
    taken_on: request.nextUrl.searchParams.get('taken_on'),
    slot: request.nextUrl.searchParams.get('slot'),
  })
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'taken_on and slot are required')

  const result = await unmarkDose(createServiceClient(), context.account.userId, ids.petId, ids.medicationId, parsed.data)
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiNoContent(context.requestId)
})
