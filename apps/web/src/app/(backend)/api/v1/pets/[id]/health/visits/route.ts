import { NextRequest } from 'next/server'
import { IDEMPOTENCY_KEY_HEADER, UuidSchema, VisitInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { createVisit } from '@/server/medical-record/visit-service'
import { isFutureDay, isPastDay, readIdempotencyKey } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/** A visit that happened, with prescriptions, or a planned one. */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = VisitInputSchema.safeParse(body)
  const key = readIdempotencyKey(request.headers, IDEMPOTENCY_KEY_HEADER)
  const wrongDay =
    parsed.success && (parsed.data.status === 'done' ? isFutureDay(parsed.data.date) : isPastDay(parsed.data.date))
  if (!parsed.success || wrongDay || !key.ok) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await createVisit(createServiceClient(), context.account.userId, id, parsed.data, key.key)
  if (!result.ok) {
    if (result.reason === 'bad_check') return apiError(context.requestId, 'bad_request', 'The check is not of this pet')
    return serviceFailureResponse(context.requestId, result.reason)
  }
  return apiSuccess(context.requestId, result.data, 201)
})
