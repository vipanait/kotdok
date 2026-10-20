import { NextRequest } from 'next/server'
import { AvatarConfirmSchema, AvatarGrantRequestSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { confirmAvatar, grantAvatar, removeAvatar, type AvatarFailure } from '@/server/pets/avatar-service'
import { getPet } from '@/server/pets/pet-service'
import { presentPets } from '@/server/pets/pet-contract'

type Params = { params: Promise<{ id: string }> }

/**
 * A pet's photo (FB-4). POST hands out a signed URL to write the file to,
 * PUT names what was written and makes it the pet's photo, DELETE removes it.
 * PUT and DELETE answer with the pet, its new photo already signed.
 */

async function readPetId(params: Params): Promise<string | null> {
  const { id } = await params.params
  return UuidSchema.safeParse(id).success ? id : null
}

async function readBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

function failure(requestId: string, reason: AvatarFailure) {
  if (reason === 'unsupported_media_type') return apiError(requestId, 'unsupported_media_type', 'The file is not a JPEG, PNG or WebP picture')
  if (reason === 'payload_too_large') return apiError(requestId, 'payload_too_large', 'The picture is too large')
  if (reason === 'not_found') return apiError(requestId, 'not_found', 'No such resource')
  return apiError(requestId, 'dependency_unavailable', 'Storage is unavailable')
}

async function answerWithPet(request: NextRequest, context: ApiContext, petId: string) {
  const supabase = createServiceClient()
  const result = await getPet(supabase, context.account.userId, petId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)
  const [pet] = await presentPets(request, supabase, [result.data])
  return apiSuccess(context.requestId, pet)
}

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const petId = await readPetId(params)
  if (!petId) return apiError(context.requestId, 'not_found', 'No such resource')
  const parsed = AvatarGrantRequestSchema.safeParse(await readBody(request))
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const supabase = createServiceClient()
  const rate = await consumeRateLimit(supabase, 'upload_create', context.account.userId)
  if (!rate.allowed) return apiError(context.requestId, 'rate_limited', 'Too many uploads, try again later.')

  const result = await grantAvatar(supabase, context.account.userId, petId, parsed.data.content_type)
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.grant, 201)
})

export const PUT = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const petId = await readPetId(params)
  if (!petId) return apiError(context.requestId, 'not_found', 'No such resource')
  const parsed = AvatarConfirmSchema.safeParse(await readBody(request))
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const supabase = createServiceClient()
  const rate = await consumeRateLimit(supabase, 'avatar_confirm', context.account.userId)
  if (!rate.allowed) return apiError(context.requestId, 'rate_limited', 'Too many uploads, try again later.')

  const result = await confirmAvatar(supabase, context.account.userId, petId, parsed.data.path)
  if (!result.ok) return failure(context.requestId, result.reason)
  return answerWithPet(request, context, petId)
})

export const DELETE = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const petId = await readPetId(params)
  if (!petId) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await removeAvatar(createServiceClient(), context.account.userId, petId)
  if (!result.ok) return failure(context.requestId, result.reason)
  return answerWithPet(request, context, petId)
})
