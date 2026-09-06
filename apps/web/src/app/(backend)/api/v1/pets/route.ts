import { NextRequest } from 'next/server'
import { PetCreateInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { createPet, listPets } from '@/server/pets/pet-service'
import { toPetContract } from '@/server/pets/pet-contract'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

export const GET = withApiAuth(async (_request, context: ApiContext) => {
  const result = await listPets(createServiceClient(), context.account.userId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, result.data.map(toPetContract))
})

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  // The schema is strict, so a user_id or id in the body is an error rather
  // than something this handler has to remember to strip.
  const parsed = PetCreateInputSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await createPet(createServiceClient(), context.account.userId, parsed.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, toPetContract(result.data), 201)
})
