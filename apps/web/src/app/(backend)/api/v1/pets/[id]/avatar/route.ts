import { NextRequest } from 'next/server'
import { AvatarConfirmSchema, AvatarGrantRequestSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
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
  const { id: petId } = await params.params
  const refused = readUuidParam(petId, context)
  if (refused) return refused
  const parsed = await readJson(request, AvatarGrantRequestSchema, context)
  if (!parsed.ok) return parsed.response

  const supabase = createServiceClient()
  const rate = await consumeRateLimit(supabase, 'upload_create', context.account.userId)
  if (!rate.allowed) return apiError(context.requestId, 'rate_limited', 'Too many uploads, try again later.')

  const result = await grantAvatar(supabase, context.account.userId, petId, parsed.data.content_type)
  if (!result.ok) return failure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.grant, 201)
})

export const PUT = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id: petId } = await params.params
  const refused = readUuidParam(petId, context)
  if (refused) return refused
  const parsed = await readJson(request, AvatarConfirmSchema, context)
  if (!parsed.ok) return parsed.response

  const supabase = createServiceClient()
  const rate = await consumeRateLimit(supabase, 'avatar_confirm', context.account.userId)
  if (!rate.allowed) return apiError(context.requestId, 'rate_limited', 'Too many uploads, try again later.')

  const result = await confirmAvatar(supabase, context.account.userId, petId, parsed.data.path)
  if (!result.ok) return failure(context.requestId, result.reason)
  return answerWithPet(request, context, petId)
})

export const DELETE = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id: petId } = await params.params
  const refused = readUuidParam(petId, context)
  if (refused) return refused

  const result = await removeAvatar(createServiceClient(), context.account.userId, petId)
  if (!result.ok) return failure(context.requestId, result.reason)
  return answerWithPet(request, context, petId)
})
