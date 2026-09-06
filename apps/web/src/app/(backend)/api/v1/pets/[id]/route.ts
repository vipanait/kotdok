import { NextRequest } from 'next/server'
import { PetUpdateInputSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getPet, softDeletePetAndChecks, updatePet } from '@/server/pets/pet-service'
import { toPetContract } from '@/server/pets/pet-contract'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
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

export const GET = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const id = await readPetId(params)
  if (!id) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await getPet(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, toPetContract(result.data))
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
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await updatePet(createServiceClient(), context.account.userId, id, parsed.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, toPetContract(result.data))
})

export const DELETE = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const id = await readPetId(params)
  if (!id) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await softDeletePetAndChecks(createServiceClient(), context.account.userId, id)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiNoContent(context.requestId)
})
