import { NextRequest } from 'next/server'
import { PetUpdateInputSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getPet, softDeletePetAndChecks, updatePet } from '@/server/pets/pet-service'
import { presentPets } from '@/server/pets/pet-contract'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { isFutureDay } from '@/server/medical-record/weight-service'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string }> }

/**
 * A malformed id is answered like a missing one: whether some other user owns
 * that row is not something the caller gets to learn from the status code.
 */
async function readPetId(params: Params): Promise<string | null> {
  const { id } = await params.params
  return UuidSchema.safeParse(id).success ? id : null
}

export const GET = withApiAuth(async (request, context: ApiContext, params: Params) => {
  const id = await readPetId(params)
  if (!id) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await getPet(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  const [pet] = await presentPets(request, createServiceClient(), [result.data])
  return apiSuccess(context.requestId, pet)
})

export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const id = await readPetId(params)
  if (!id) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = PetUpdateInputSchema.safeParse(body)
  // A weighing day ahead of every time zone is a wrong clock, and it would stay
  // the newest measurement for ever.
  // So is a birth or a home day ahead of every time zone (FB-2/01).
  const days = parsed.success ? [parsed.data.weight_measured_on, parsed.data.birth_date, parsed.data.adopted_on] : []
  if (!parsed.success || days.some((day) => day != null && isFutureDay(day))) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await updatePet(createServiceClient(), context.account.userId, id, parsed.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  const [pet] = await presentPets(request, createServiceClient(), [result.data])
  return apiSuccess(context.requestId, pet)
})

export const DELETE = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const id = await readPetId(params)
  if (!id) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await softDeletePetAndChecks(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiNoContent(context.requestId)
})
