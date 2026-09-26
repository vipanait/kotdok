import { NextRequest } from 'next/server'
import { PetSpeciesSchema, ProductKindSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { listCatalog } from '@/server/medical-record/catalog-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

/** The catalogue for one species and kind: `?species=cat&kind=vaccine&q=нобив`. */
export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const search = request.nextUrl.searchParams
  const species = PetSpeciesSchema.safeParse(search.get('species'))
  const kind = ProductKindSchema.safeParse(search.get('kind'))
  const query = search.get('q') ?? ''
  if (!species.success || !kind.success || query.length > 100) {
    return apiError(context.requestId, 'bad_request', 'Query does not match the contract')
  }

  const result = await listCatalog(createServiceClient(), species.data, kind.data, query)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.data)
})
