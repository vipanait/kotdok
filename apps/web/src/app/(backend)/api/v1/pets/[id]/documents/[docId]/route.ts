import { NextRequest } from 'next/server'
import { DocumentPatchSchema } from '@lapka/contracts'
import { apiNoContent, apiSuccess } from '@/server/api/response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { deleteDocument, patchDocument, readDocument } from '@/server/documents/document-service'
import { documentContext, documentFailure } from '@/server/api/document-response'

type Params = { params: Promise<{ id: string; docId: string }> }

/** One document of a pet (DOC-1): read with fresh read links, rename or re-date, or remove with its files. */

async function ids(context: ApiContext, params: Params) {
  const { id, docId } = await params.params
  return { id, docId, refused: readUuidParam(id, context) ?? readUuidParam(docId, context) }
}

export const GET = withApiAuth(async (_request: NextRequest, context: ApiContext, params: Params) => {
  const { id, docId, refused } = await ids(context, params)
  if (refused) return refused

  const result = await readDocument(documentContext(context.account.userId), id, docId)
  if (!result.ok) return documentFailure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.value)
})

export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, docId, refused } = await ids(context, params)
  if (refused) return refused
  const parsed = await readJson(request, DocumentPatchSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await patchDocument(documentContext(context.account.userId), id, docId, parsed.data)
  if (!result.ok) return documentFailure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.value)
})

export const DELETE = withApiAuth(async (_request: NextRequest, context: ApiContext, params: Params) => {
  const { id, docId, refused } = await ids(context, params)
  if (refused) return refused

  const result = await deleteDocument(documentContext(context.account.userId), id, docId)
  if (!result.ok) return documentFailure(context.requestId, result.reason)
  return apiNoContent(context.requestId)
})
