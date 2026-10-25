import { NextRequest } from 'next/server'
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY_REUSED, WeightPatchSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { changeWeight, deleteWeight, isFutureDay, readIdempotencyKey } from '@/server/medical-record/weight-service'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; weightId: string }> }

/**
 * A correction. 409 `conflict`: the day already has a measurement, or — with
 * `details.reason: idempotency_key_reused` — the optional Idempotency-Key was
 * used for another correction; the same key with the same body answers with
 * the measurement.
 */
export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, weightId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(weightId, context)
  if (refused) return refused

  const parsed = await readJson(request, WeightPatchSchema, context)
  if (!parsed.ok) return parsed.response
  if (parsed.data.measured_on && isFutureDay(parsed.data.measured_on)) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }
  const key = readIdempotencyKey(request.headers, IDEMPOTENCY_KEY_HEADER)
  if (!key.ok) return apiError(context.requestId, 'bad_request', 'Idempotency-Key is not valid')

  // withApiAuth has refused inactive accounts; the table's late-write trigger
  // covers an account that starts deleting mid-request.
  const supabase = createServiceClient()
  const result = await changeWeight(supabase, context.account.userId, id, weightId, parsed.data, key.key)
  if (!result.ok) {
    if (result.reason === 'key_reused') {
      return apiError(context.requestId, 'conflict', 'Same Idempotency-Key with different data', { reason: IDEMPOTENCY_KEY_REUSED })
    }
    return serviceFailureResponse(context.requestId, result.reason)
  }

  return apiSuccess(context.requestId, result.data)
})

export const DELETE = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id, weightId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(weightId, context)
  if (refused) return refused

  // withApiAuth has refused inactive accounts; the table's late-write trigger
  // covers an account that starts deleting mid-request.
  const supabase = createServiceClient()
  const result = await deleteWeight(supabase, context.account.userId, id, weightId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiNoContent(context.requestId)
})
