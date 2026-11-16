import { NextRequest } from 'next/server'
import { DocumentCreateInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { apiError, apiSuccess } from '@/server/api/response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { createDocument, listDocuments } from '@/server/documents/document-service'
import { documentContext, documentFailure } from '@/server/api/document-response'

type Params = { params: Promise<{ id: string }> }

/**
 * A pet's documents (DOC-1). GET lists the stored ones with the free
 * recognitions left; POST makes a `pending` document and hands out signed URLs
 * to PUT each file to, after which `…/{docId}/complete` checks the bytes.
 */

export const GET = withApiAuth(async (_request: NextRequest, context: ApiContext, params: Params) => {
  const { id: petId } = await params.params
  const refused = readUuidParam(petId, context)
  if (refused) return refused

  const result = await listDocuments(documentContext(context.account.userId), petId)
  if (!result.ok) return documentFailure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.value)
})

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id: petId } = await params.params
  const refused = readUuidParam(petId, context)
  if (refused) return refused
  const parsed = await readJson(request, DocumentCreateInputSchema, context)
  if (!parsed.ok) return parsed.response

  const rate = await consumeRateLimit(createServiceClient(), 'document_create', context.account.userId)
  if (!rate.allowed) return apiError(context.requestId, 'rate_limited', 'Too many documents, try again later.')

  const result = await createDocument(documentContext(context.account.userId), petId, parsed.data)
  if (!result.ok) return documentFailure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.value, 201)
})
