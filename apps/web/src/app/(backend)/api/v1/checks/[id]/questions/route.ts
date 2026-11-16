import { NextRequest } from 'next/server'
import {
  CheckQuestionInputSchema,
  CheckQuestionResultSchema,
  CheckQuestionThreadSchema,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_REUSED,
  IdempotencyKeySchema,
} from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { askCheckQuestion, getQuestionThread, type QuestionFailure } from '@/server/check-questions/check-question-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { requestToday } from '@/server/medical-record/weight-service'

type Params = { params: Promise<{ id: string }> }

/**
 * The answer is waited for inside the request: two attempts of 30 seconds at
 * the model, the knowledge base and the record around them. A phone waits 75.
 */
export const maxDuration = 90

function failure(requestId: string, reason: QuestionFailure) {
  if (reason === 'model_unavailable') {
    // Not counted: the place the question took was given back.
    return apiError(requestId, 'dependency_unavailable', 'No answer could be produced; the question was not counted')
  }
  if (reason === 'key_reused') {
    return apiError(requestId, 'conflict', `${IDEMPOTENCY_KEY_HEADER} was used for another question`, {
      reason: IDEMPOTENCY_KEY_REUSED,
    })
  }
  return serviceOrRateFailureResponse(requestId, reason)
}

/**
 * Questions about one result (CQ-01): what was asked and answered, and whether
 * more may be asked. A separate resource rather than fields on the check,
 * whose schema installed builds read strictly.
 */
export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const result = await getQuestionThread(createServiceClient(), context.account.userId, id)
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiSuccess(context.requestId, CheckQuestionThreadSchema.parse(result.data))
})

/**
 * Asks one question and answers it. Idempotency-Key is required: a retry after
 * a lost response returns the stored answer instead of spending a second of
 * the check's three. 409 `conflict` when none are left, the 48 hours have
 * passed, or the same key is still being answered; the client reads the
 * thread again. Free: no credit is spent.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const key = IdempotencyKeySchema.safeParse(request.headers.get(IDEMPOTENCY_KEY_HEADER))
  if (!key.success) return apiError(context.requestId, 'bad_request', `${IDEMPOTENCY_KEY_HEADER} is required`)

  const parsed = await readJson(request, CheckQuestionInputSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await askCheckQuestion(createServiceClient(), {
    userId: context.account.userId,
    checkId: id,
    question: parsed.data.question,
    clientKey: key.data,
    today: requestToday(request.nextUrl),
  })
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiSuccess(context.requestId, CheckQuestionResultSchema.parse(result.data))
})
