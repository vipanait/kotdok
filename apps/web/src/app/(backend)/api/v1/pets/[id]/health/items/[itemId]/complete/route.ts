import { NextRequest } from 'next/server'
import { CompleteItemInputSchema, IDEMPOTENCY_KEY_HEADER, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { completeItem } from '@/server/medical-record/event-service'
import { isFutureDay } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; itemId: string }> }

/**
 * «Сделано» on one planned item: only that item becomes done; others planned
 * for the same day stay planned. Sent twice, it does not add anything.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, itemId } = await params.params
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(itemId).success) {
    return apiError(context.requestId, 'not_found', 'No such resource')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = CompleteItemInputSchema.safeParse(body)
  if (!parsed.success || isFutureDay(parsed.data.done_on)) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)
  const result = await completeItem(createServiceClient(), context.account.userId, id, itemId, parsed.data, key)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data)
})
