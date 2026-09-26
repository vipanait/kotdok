import { NextRequest } from 'next/server'
import { UuidSchema, WeightPatchSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { changeWeight, deleteWeight, isFutureDay } from '@/server/medical-record/weight-service'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; weightId: string }> }

/** Both ids, or null: a malformed one is answered like a missing one. */
async function readIds(params: Params): Promise<{ petId: string; weightId: string } | null> {
  const { id, weightId } = await params.params
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(weightId).success) return null
  return { petId: id, weightId }
}

export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = WeightPatchSchema.safeParse(body)
  if (!parsed.success || (parsed.data.measured_on && isFutureDay(parsed.data.measured_on))) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  // withApiAuth has refused inactive accounts; the table's late-write trigger
  // covers an account that starts deleting mid-request.
  const supabase = createServiceClient()
  const result = await changeWeight(supabase, context.account.userId, ids.petId, ids.weightId, parsed.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data)
})

export const DELETE = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')

  // withApiAuth has refused inactive accounts; the table's late-write trigger
  // covers an account that starts deleting mid-request.
  const supabase = createServiceClient()
  const result = await deleteWeight(supabase, context.account.userId, ids.petId, ids.weightId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiNoContent(context.requestId)
})
