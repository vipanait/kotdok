import { NextRequest } from 'next/server'
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY_REUSED, UuidSchema, WeightInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { isFutureDay, readIdempotencyKey, recordWeight } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * A weighing for a day. A second one for the same day replaces that day's value.
 *
 * An optional Idempotency-Key makes a retry harmless even after midnight:
 * the same key with the same weighing answers with the measurement it made;
 * with another weighing, 409 `conflict` with `details.reason:
 * idempotency_key_reused` — told apart from a day already taken.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = WeightInputSchema.safeParse(body)
  if (!parsed.success || isFutureDay(parsed.data.measured_on)) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }
  const key = readIdempotencyKey(request.headers, IDEMPOTENCY_KEY_HEADER)
  if (!key.ok) return apiError(context.requestId, 'bad_request', 'Idempotency-Key is not valid')

  // withApiAuth has refused inactive accounts; the table's late-write trigger
  // covers an account that starts deleting mid-request.
  const supabase = createServiceClient()
  const result = await recordWeight(supabase, context.account.userId, id, parsed.data, 'record', key.key)
  if (!result.ok) {
    if (result.reason === 'key_reused') {
      return apiError(context.requestId, 'conflict', 'Same Idempotency-Key with different data', { reason: IDEMPOTENCY_KEY_REUSED })
    }
    return serviceFailureResponse(context.requestId, result.reason)
  }

  return apiSuccess(context.requestId, result.data, 201)
})
