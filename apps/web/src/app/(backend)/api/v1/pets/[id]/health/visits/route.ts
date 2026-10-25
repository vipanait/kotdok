import { NextRequest } from 'next/server'
import { IDEMPOTENCY_KEY_HEADER, VisitInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { createVisit } from '@/server/medical-record/visit-service'
import { isFutureDay, isPastDay, readIdempotencyKey, requestToday } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * A visit that happened, with prescriptions, or a planned one. A course a
 * prescription adds refreshes the pet form's list, counted from the owner's
 * `?today=` (`requestToday`).
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const parsed = await readJson(request, VisitInputSchema, context)
  if (!parsed.ok) return parsed.response
  const key = readIdempotencyKey(request.headers, IDEMPOTENCY_KEY_HEADER)
  const wrongDay = parsed.data.status === 'done' ? isFutureDay(parsed.data.date) : isPastDay(parsed.data.date)
  if (wrongDay || !key.ok) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await createVisit(createServiceClient(), context.account.userId, id, parsed.data, key.key, requestToday(request.nextUrl))
  if (!result.ok) {
    if (result.reason === 'bad_check') return apiError(context.requestId, 'bad_request', 'The check is not of this pet')
    return serviceFailureResponse(context.requestId, result.reason)
  }
  return apiSuccess(context.requestId, result.data, 201)
})
