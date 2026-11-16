import { NextRequest } from 'next/server'
import { UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getSafetyItem } from '@/server/safety/safety-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ slug: string }> }

/**
 * One entry in the account's language: `?pet_id=` puts that pet's species
 * first and adds the notes from its profile. A pet that is not the caller's,
 * or is deleted, is `not_found`; a pet id that is not a UUID is a malformed
 * query, 400.
 */
export const GET = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { slug } = await params.params
  const rawPetId = request.nextUrl.searchParams.get('pet_id')
  const petId = rawPetId === null ? null : UuidSchema.safeParse(rawPetId)
  if (petId && !petId.success) return apiError(context.requestId, 'bad_request', 'Query does not match the contract')

  const result = await getSafetyItem(createServiceClient(), {
    userId: context.account.userId,
    slug,
    petId: petId ? petId.data : null,
    locale: context.account.locale,
  })
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.data)
})
