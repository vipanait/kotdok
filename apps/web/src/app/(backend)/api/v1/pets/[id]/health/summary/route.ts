import { UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getVetSummary } from '@/server/medical-record/summary-service'
import { clientToday } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * «Для врача»: the summary the screen and the PDF are built from (spec §7.17).
 * `?today=` is the owner's calendar day — what «принимает сейчас» and the
 * year of visits count from; the server's UTC day when it is missing or not
 * today anywhere (`clientToday`).
 */
export const GET = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  const today = clientToday(request.nextUrl.searchParams.get('today'))
  const result = await getVetSummary(createServiceClient(), context.account.userId, id, today)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data)
})
