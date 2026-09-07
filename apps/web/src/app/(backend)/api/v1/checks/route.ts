import { NextRequest } from 'next/server'
import {
  CheckCreateInputSchema,
  CheckHistoryQuerySchema,
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeySchema,
} from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { listChecks } from '@/server/checks/check-history-service'
import { createCheckJob } from '@/server/checks/check-job-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const params = request.nextUrl.searchParams
  const raw: Record<string, unknown> = {}
  if (params.has('pet_id')) raw.pet_id = params.get('pet_id')
  if (params.has('cursor')) raw.cursor = params.get('cursor')
  if (params.has('limit')) {
    const limit = Number(params.get('limit'))
    // A page size past the maximum is refused rather than quietly clamped, so a
    // client never believes it asked for more than it received.
    if (!Number.isInteger(limit)) {
      return apiError(context.requestId, 'bad_request', 'limit must be a whole number')
    }
    raw.limit = limit
  }

  const parsed = CheckHistoryQuerySchema.safeParse(raw)
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Query does not match the contract')
  }

  const result = await listChecks(createServiceClient(), {
    userId: context.account.userId,
    petId: parsed.data.pet_id,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  })
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data)
})

/**
 * Accepts an analysis and answers with the job to poll.
 *
 * 202 rather than 201: what is created is the processing, not the check. The
 * work happens inside this request for now — the background worker arrives with
 * photographs at the end of the queue — but a client written against this will
 * not have to change when it moves.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const supabase = createServiceClient()

  // An analysis costs an AI call and a credit, which is why this allowance was
  // written in stage 1. This is the first route to spend it.
  const verdict = await consumeRateLimit(supabase, 'analysis_create', context.account.userId)
  if (!verdict.allowed) {
    return apiError(
      context.requestId,
      'rate_limited',
      'Слишком много проверок подряд. Попробуйте позже',
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = CheckCreateInputSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)
  if (idempotencyKey !== null && !IdempotencyKeySchema.safeParse(idempotencyKey).success) {
    // A key that cannot be stored is worse than no key: the caller would believe
    // a retry was safe while nothing was recording it.
    return apiError(context.requestId, 'bad_request', `${IDEMPOTENCY_KEY_HEADER} is not valid`)
  }

  const outcome = await createCheckJob(supabase, {
    ...parsed.data,
    userId: context.account.userId,
    idempotencyKey,
  })

  if (!outcome.ok) return apiError(context.requestId, outcome.code, outcome.message)

  return apiSuccess(
    context.requestId,
    { job_id: outcome.jobId, status_url: `/api/v1/check-jobs/${outcome.jobId}` },
    202,
  )
})
