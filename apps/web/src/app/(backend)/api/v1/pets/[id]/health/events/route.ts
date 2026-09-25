import { NextRequest } from 'next/server'
import { HealthEventInputSchema, IDEMPOTENCY_KEY_HEADER, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { createEvent } from '@/server/medical-record/event-service'
import { isFutureDay, isPastDay } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * A new record, with its next plans. A done record cannot be in the future
 * and a plan cannot be in the past (MR-03.3). The same Idempotency-Key twice
 * returns the first record.
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

  const parsed = HealthEventInputSchema.safeParse(body)
  const wrongDay =
    parsed.success &&
    (parsed.data.status === 'done' ? isFutureDay(parsed.data.date) : isPastDay(parsed.data.date))
  if (!parsed.success || wrongDay) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)
  const result = await createEvent(createServiceClient(), context.account.userId, id, parsed.data, key)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data, 201)
})
