import { NextRequest } from 'next/server'
import { IDEMPOTENCY_KEY_HEADER, MedicationsInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { addMedications } from '@/server/medical-record/medication-service'
import { readIdempotencyKey, requestToday } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * One or more courses; the pet form's list follows, counted from the
 * owner's `?today=` (`requestToday`). The same key twice adds them once.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const parsed = await readJson(request, MedicationsInputSchema, context)
  if (!parsed.ok) return parsed.response
  const key = readIdempotencyKey(request.headers, IDEMPOTENCY_KEY_HEADER)
  if (!key.ok) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await addMedications(createServiceClient(), context.account.userId, id, parsed.data, key.key, requestToday(request.nextUrl))
  if (!result.ok) {
    if (result.reason === 'bad_range') return apiError(context.requestId, 'bad_request', 'The end is before the start')
    return serviceFailureResponse(context.requestId, result.reason)
  }
  return apiSuccess(context.requestId, result.data, 201)
})
