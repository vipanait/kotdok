import { NextRequest } from 'next/server'
import { PetUpdateInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getPet, softDeletePetAndChecks, updatePet } from '@/server/pets/pet-service'
import { presentPets } from '@/server/pets/pet-contract'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { isFutureDay } from '@/server/medical-record/weight-service'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const result = await getPet(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  const [pet] = await presentPets(request, createServiceClient(), [result.data])
  return apiSuccess(context.requestId, pet)
})

export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const parsed = await readJson(request, PetUpdateInputSchema, context)
  if (!parsed.ok) return parsed.response
  // A weighing day ahead of every time zone is a wrong clock, and it would stay
  // the newest measurement for ever.
  // So is a birth or a home day ahead of every time zone (FB-2/01).
  const days = [parsed.data.weight_measured_on, parsed.data.birth_date, parsed.data.adopted_on]
  if (days.some((day) => day != null && isFutureDay(day))) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await updatePet(createServiceClient(), context.account.userId, id, parsed.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  const [pet] = await presentPets(request, createServiceClient(), [result.data])
  return apiSuccess(context.requestId, pet)
})

export const DELETE = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const { id } = await params.params
  const refused = readUuidParam(id, context)
  if (refused) return refused

  const result = await softDeletePetAndChecks(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiNoContent(context.requestId)
})
