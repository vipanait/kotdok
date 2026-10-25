import { NextRequest } from 'next/server'
import { PetCreateInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { createPet, listPets } from '@/server/pets/pet-service'
import { presentPets } from '@/server/pets/pet-contract'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { isFutureDay } from '@/server/medical-record/weight-service'
import { readJson } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

export const GET = withApiAuth(async (request, context: ApiContext) => {
  const supabase = createServiceClient()
  const result = await listPets(supabase, context.account.userId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiSuccess(context.requestId, await presentPets(request, supabase, result.data))
})

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  // The schema is strict, so a user_id or id in the body is an error rather
  // than something this handler has to remember to strip.
  const parsed = await readJson(request, PetCreateInputSchema, context)
  if (!parsed.ok) return parsed.response
  // A weighing day ahead of every time zone is a wrong clock, and it would stay
  // the newest measurement for ever.
  // So is a birth or a home day ahead of every time zone (FB-2/01).
  const days = [parsed.data.weight_measured_on, parsed.data.birth_date, parsed.data.adopted_on]
  if (days.some((day) => day != null && isFutureDay(day))) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await createPet(createServiceClient(), context.account.userId, parsed.data)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  const [pet] = await presentPets(request, createServiceClient(), [result.data])
  return apiSuccess(context.requestId, pet, 201)
})
