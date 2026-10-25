import { NextRequest } from 'next/server'
import {
  CheckCreateInputSchema,
  FOLLOWUP_FEATURE,
  CheckHistoryQuerySchema,
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeySchema,
} from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { listChecks } from '@/server/checks/check-history-service'
import { createCheckJob } from '@/server/checks/check-job-service'
import { requestToday } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { reads } from '@/server/pets/pet-contract'
import { withCaseLinks } from '@/server/followup/followup-service'
import { readJson } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

/**
 * An analysis runs inside the request: up to two attempts at the model of a
 * minute each (`OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES`), the photos and the
 * database around them. The budget is said here so the platform never ends
 * the function in the middle — that is the one case where a spent credit is
 * not given back.
 */
export const maxDuration = 180

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
  if (!reads(request, FOLLOWUP_FEATURE)) return apiSuccess(context.requestId, result.data)

  const linked = await withCaseLinks(createServiceClient(), context.account.userId, result.data.items)
  if (!linked.ok) return serviceFailureResponse(context.requestId, 'storage_error')
  return apiSuccess(context.requestId, { ...result.data, items: linked.data })
})

/**
 * Accepts an analysis and answers with the job to poll.
 *
 * 202 rather than 201: what is created is the processing, not the check. The
 * work happens inside this request for now — the background worker arrives with
 * photographs at the end of the queue — but a client written against this will
 * not have to change when it moves.
 *
 * `?today=` is the owner's calendar day the pet's medical record is read on
 * for the analysis (`requestToday`): a query parameter, not a body field —
 * the body is strict, and a newer app must still be accepted by an older
 * server.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const supabase = createServiceClient()

  // The analysis allowance is spent inside analyzeSymptomCheck, which the site
  // calls too. Spending it here as well charged the phone twice per check.

  const parsed = await readJson(request, CheckCreateInputSchema, context)
  if (!parsed.ok) return parsed.response

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
    today: requestToday(request.nextUrl),
  })

  if (!outcome.ok) return apiError(context.requestId, outcome.code, outcome.message)

  return apiSuccess(
    context.requestId,
    { job_id: outcome.jobId, status_url: `/api/v1/check-jobs/${outcome.jobId}` },
    202,
  )
})
