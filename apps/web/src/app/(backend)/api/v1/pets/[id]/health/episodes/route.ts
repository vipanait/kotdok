import { PastEpisodeListSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { listPastEpisodes } from '@/server/followup/followup-service'
import { apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/** «Перенесённые случаи»: the pet's closed cases the owner kept, newest first. */
export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const result = await listPastEpisodes(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, PastEpisodeListSchema.parse({ items: result.data.map(({ ...episode }) => episode) }))
})
