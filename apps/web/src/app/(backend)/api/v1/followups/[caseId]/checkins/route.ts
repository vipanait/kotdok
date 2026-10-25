import { NextRequest } from 'next/server'
import {
  FollowupCheckinInputSchema,
  FollowupCheckinResultSchema,
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeySchema,
  UuidSchema,
} from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { recordFollowupCheckin } from '@/server/followup/followup-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ caseId: string }> }

/**
 * «Лучше / Так же / Хуже». The answer and what the fixed rule decided come
 * back together. Idempotency-Key is required: a second tap or a retry after a
 * lost response returns the stored answer (200) instead of a second one (201).
 * 409 `conflict` for a closed case; 400 when the vet question is missing or not
 * asked.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { caseId } = await params.params
  if (!UuidSchema.safeParse(caseId).success) return apiError(context.requestId, 'not_found', 'No such resource')

  const key = IdempotencyKeySchema.safeParse(request.headers.get(IDEMPOTENCY_KEY_HEADER))
  if (!key.success) return apiError(context.requestId, 'bad_request', 'Idempotency-Key is required')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }
  const parsed = FollowupCheckinInputSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await recordFollowupCheckin(createServiceClient(), context.account.userId, caseId, parsed.data, key.data)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  const { created, ...body2 } = result.data
  return apiSuccess(context.requestId, FollowupCheckinResultSchema.parse(body2), created ? 201 : 200)
})
