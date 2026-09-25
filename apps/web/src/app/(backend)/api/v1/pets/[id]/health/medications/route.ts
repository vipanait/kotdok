import { NextRequest } from 'next/server'
import { IDEMPOTENCY_KEY_HEADER, MedicationsInputSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { addMedications } from '@/server/medical-record/medication-service'
import { readIdempotencyKey } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/** One or more courses; the pet form's list follows. The same key twice adds them once. */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = MedicationsInputSchema.safeParse(body)
  const key = readIdempotencyKey(request.headers, IDEMPOTENCY_KEY_HEADER)
  if (!parsed.success || !key.ok) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await addMedications(createServiceClient(), context.account.userId, id, parsed.data, key.key)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.data, 201)
})
