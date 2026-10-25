import { VetSummaryQuerySchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getVetSummary } from '@/server/medical-record/summary-service'
import { clientToday } from '@/server/medical-record/weight-service'
import { apiSuccess } from '@/server/api/response'
import { presentPet } from '@/server/pets/pet-contract'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * «Для врача»: the summary the screen and the PDF are built from (spec §7.17).
 * `?today=` is the owner's calendar day — what «принимает сейчас» and the
 * year of visits count from; the server's UTC day when it is missing, not a
 * calendar day (`VetSummaryQuerySchema`), or outside the UTC days around the
 * server's (`clientToday`).
 */
export const GET = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const query = VetSummaryQuerySchema.safeParse({ today: request.nextUrl.searchParams.get('today') ?? undefined })
  const today = clientToday(query.success ? query.data.today : undefined)
  const result = await getVetSummary(createServiceClient(), context.account.userId, id, today)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, { ...result.data, pet: await presentPet(request, createServiceClient(), result.data.pet, result.avatar_path ?? null) })
})
