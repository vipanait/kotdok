import { NextRequest } from 'next/server'
import { CheckHistoryQuerySchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { listChecks } from '@/server/checks/check-history-service'
import { apiError, apiSuccess } from '@/server/api/response'
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
