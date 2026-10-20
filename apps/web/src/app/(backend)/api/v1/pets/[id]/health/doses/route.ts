import { CalendarDateSchema, UuidSchema } from '@lapka/contracts'
import { daysBetween } from '@lapka/shared'
import { createServiceClient } from '@/server/supabase/server'
import { listDoses } from '@/server/medical-record/dose-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/** A pet's «дали» between `?from` and `?to` (FB-5), at most 31 days. */
export const GET = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  const from = CalendarDateSchema.safeParse(request.nextUrl.searchParams.get('from'))
  const to = CalendarDateSchema.safeParse(request.nextUrl.searchParams.get('to'))
  if (!from.success || !to.success || to.data < from.data || daysBetween(from.data, to.data) > 31) {
    return apiError(context.requestId, 'bad_request', 'from and to are days at most 31 apart')
  }

  const result = await listDoses(createServiceClient(), context.account.userId, id, from.data, to.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.data)
})
