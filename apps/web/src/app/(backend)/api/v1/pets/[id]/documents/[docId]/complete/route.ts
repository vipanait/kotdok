import { NextRequest } from 'next/server'
import { apiSuccess } from '@/server/api/response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { completeDocument } from '@/server/documents/document-service'
import { documentContext, documentFailure } from '@/server/api/document-response'

type Params = { params: Promise<{ id: string; docId: string }> }

/**
 * The phone has written every file (DOC-1): download and check them, and move
 * the document to `stored`. A file that is not what it was declared to be
 * removes the document and answers 400 `bad_request` with `details.reason`.
 * Repeating the call for a stored document answers it again.
 */
export const POST = withApiAuth(async (_request: NextRequest, context: ApiContext, params: Params) => {
  const { id, docId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(docId, context)
  if (refused) return refused

  const result = await completeDocument(documentContext(context.account.userId), id, docId)
  if (!result.ok) return documentFailure(context.requestId, result.reason)
  return apiSuccess(context.requestId, result.value)
})
