import { FOLLOWUP_FEATURE, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getCheck } from '@/server/checks/check-history-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { reads } from '@/server/pets/pet-contract'
import { withCaseLinks } from '@/server/followup/followup-service'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  if (!UuidSchema.safeParse(id).success) {
    return apiError(context.requestId, 'not_found', 'No such resource')
  }

  const result = await getCheck(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  // `followup` only for a client that reads it: installed builds parse the check strictly.
  if (!reads(request, FOLLOWUP_FEATURE)) return apiSuccess(context.requestId, result.data)

  const linked = await withCaseLinks(createServiceClient(), context.account.userId, [result.data])
  if (!linked.ok) return serviceFailureResponse(context.requestId, 'storage_error')
  return apiSuccess(context.requestId, linked.data[0])
})
