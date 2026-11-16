import 'server-only'

import type { NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { apiError } from '@/server/api/response'
import type { DocumentContext, DocumentFailure } from '@/server/documents/document-service'
import { supabaseDocumentStorage } from '@/server/documents/document-storage'

/** What the document routes share: the service's context, and how its refusals are answered. */

export function documentContext(userId: string): DocumentContext {
  const supabase = createServiceClient()
  return { supabase, storage: supabaseDocumentStorage(supabase), userId }
}

export function documentFailure(requestId: string, reason: DocumentFailure): NextResponse {
  switch (reason) {
    case 'not_found':
      return apiError(requestId, 'not_found', 'No such resource')
    case 'limit_reached':
      return apiError(requestId, 'conflict', 'The pet already has the most documents', { reason })
    case 'wrong_status':
      return apiError(requestId, 'conflict', 'The document is not in a state for this', { reason })
    // A file `complete` refused: the document and its objects are already gone.
    case 'too_many_pages':
    case 'encrypted':
    case 'unsupported_media_type':
    case 'payload_too_large':
      return apiError(requestId, 'bad_request', 'The file was refused', { reason })
    case 'storage_error':
      return apiError(requestId, 'dependency_unavailable', 'Storage is unavailable')
    default: {
      // A reason added to the service without a status here fails to compile.
      const unmapped: never = reason
      return unmapped
    }
  }
}
