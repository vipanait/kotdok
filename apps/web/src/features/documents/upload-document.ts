import type { DocumentKind, PetDocument } from '@lapka/contracts'
import { ApiError, apiFailure } from '@lapka/shared'
import type { DocumentApi } from './document-api'
import type { PreparedPage } from './prepare-pages'

/**
 * «Сохранить документ» (DOC-1): ask for the upload, write each page straight
 * to storage through its signed URL, then ask the server to check the files.
 * A file the server refuses removes the document there; one that did not
 * reach storage leaves a pending upload the server sweeps away. Either way
 * nothing half-saved is listed.
 */

export class PageUploadError extends Error {
  constructor() {
    super('a page did not reach storage')
    this.name = 'PageUploadError'
  }
}

export type UploadProgress = { step: 'start' } | { step: 'page'; n: number; total: number } | { step: 'check' }

export async function uploadDocument(
  api: Pick<DocumentApi, 'create' | 'put' | 'complete'>,
  petId: string,
  kind: DocumentKind,
  pages: PreparedPage[],
  onProgress: (progress: UploadProgress) => void = () => {},
): Promise<PetDocument> {
  onProgress({ step: 'start' })
  const grant = await api.create(petId, {
    kind,
    files: pages.map((page) => ({ content_type: page.contentType, size_bytes: page.blob.size })),
  })
  for (const [index, upload] of grant.uploads.entries()) {
    onProgress({ step: 'page', n: index + 1, total: grant.uploads.length })
    if (!(await api.put(upload.url, upload.headers, pages[index].blob))) throw new PageUploadError()
  }
  onProgress({ step: 'check' })
  return api.complete(petId, grant.document_id)
}

/** The server's word on a refused file (`details.reason` of a 400). */
export const FILE_REFUSALS = ['too_many_pages', 'encrypted', 'unsupported_media_type', 'payload_too_large'] as const

export type UploadFailure =
  | (typeof FILE_REFUSALS)[number]
  /** A 400 without a reason this site knows. */
  | 'refused'
  | 'limit_reached'
  | 'rateLimited'
  | 'offline'
  | 'signedOut'
  | 'deleting'
  | 'gone'
  | 'upload'
  | 'failed'

function detailsReason(error: ApiError): string | null {
  const details = error.details
  if (details && typeof details === 'object' && 'reason' in details && typeof details.reason === 'string') return details.reason
  return null
}

/** What a failed save means, for the form to say in its own words. */
export function uploadFailure(error: unknown): UploadFailure {
  if (error instanceof PageUploadError) return 'upload'
  const failure = apiFailure(error)
  if (error instanceof ApiError) {
    const reason = detailsReason(error)
    if (failure === 'rejected') {
      return (FILE_REFUSALS as readonly string[]).includes(reason ?? '') ? (reason as UploadFailure) : 'refused'
    }
    if (failure === 'conflict' && reason === 'limit_reached') return 'limit_reached'
  }
  switch (failure) {
    case 'rateLimited':
    case 'offline':
    case 'signedOut':
    case 'deleting':
    case 'gone':
      return failure
    default:
      return 'failed'
  }
}
