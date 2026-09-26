import { UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getVetSummary } from '@/server/medical-record/summary-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/** «Для врача»: the summary the screen and the PDF are built from (spec §7.17). */
export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await getVetSummary(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data)
})
