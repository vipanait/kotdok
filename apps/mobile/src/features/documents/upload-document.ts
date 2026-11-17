import { DOCUMENT_LIMITS, type DocumentKind, type PetDocument } from '@lapka/contracts'
import { ApiError, apiFailure, type ApiClient } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { megabytes } from './document-view'
import type { PickedPage } from './page-list'

/**
 * «Сохранить документ» (DOC-1), the same three steps as the site's
 * `upload-document.ts`: ask for the upload, write each page straight to
 * storage through its signed URL, then ask the server to check the files.
 * A file the server refuses removes the document there; one that did not
 * reach storage leaves a pending upload the server sweeps away. Either way
 * nothing half-saved is listed.
 *
 * A `complete` that got no answer (a timeout, a dropped connection) may
 * still have stored the document: it is read again before the failure is
 * said, so a second press does not save it twice.
 */

export class PageUploadError extends Error {
  constructor() {
    super('a page did not reach storage')
    this.name = 'PageUploadError'
  }
}

export type UploadProgress = { step: 'start' } | { step: 'page'; n: number; total: number } | { step: 'check' }

export type UploadDeps = Pick<ApiClient, 'createDocument' | 'completeDocument' | 'getDocument'> & {
  /** One file straight to storage through its signed URL; false when it did not land. */
  put: (url: string, headers: Record<string, string>, page: PickedPage) => Promise<boolean>
}

export async function uploadDocument(
  api: UploadDeps,
  petId: string,
  { kind, title }: { kind: DocumentKind; title?: string },
  pages: readonly PickedPage[],
  onProgress: (progress: UploadProgress) => void = () => {},
): Promise<PetDocument> {
  onProgress({ step: 'start' })
  const name = title?.trim()
  const grant = await api.createDocument(petId, {
    kind,
    ...(name ? { title: name } : {}),
    files: pages.map((page) => ({ content_type: page.contentType, size_bytes: page.size })),
  })
  // One after another, in the order of the list: the order is the pages' order.
  for (const [index, upload] of grant.uploads.entries()) {
    onProgress({ step: 'page', n: index + 1, total: grant.uploads.length })
    if (!(await api.put(upload.url, upload.headers, pages[index]))) throw new PageUploadError()
  }
  onProgress({ step: 'check' })
  try {
    return await api.completeDocument(petId, grant.document_id)
  } catch (error) {
    if (apiFailure(error) !== 'offline') throw error
    // No answer: the server may have stored it all the same.
    const stored = await api.getDocument(petId, grant.document_id).catch(() => null)
    if (stored && stored.status !== 'pending') return stored
    throw error
  }
}

/** The server's word on a refused file (`details.reason` of a 400). */
export const FILE_REFUSALS = ['too_many_pages', 'encrypted', 'unsupported_media_type', 'payload_too_large'] as const

export type FileRefusal = (typeof FILE_REFUSALS)[number] | 'refused'

export type UploadFailure =
  | FileRefusal
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

/** What a failed save means, for the screen to say in its own words. */
export function uploadFailure(error: unknown): UploadFailure {
  if (error instanceof PageUploadError) return 'upload'
  const failure = apiFailure(error)
  if (error instanceof ApiError) {
    const reason = detailsReason(error)
    if (failure === 'rejected') {
      return (FILE_REFUSALS as readonly string[]).includes(reason ?? '') ? (reason as FileRefusal) : 'refused'
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

/** A refused file is said as a heading and a line above the form; anything else is one sentence. */
export type UploadMessage = { kind: 'file'; title: string; body: string } | { kind: 'banner'; text: string; offline: boolean }

export function uploadMessage(t: Dictionary, failure: UploadFailure): UploadMessage {
  const words = t.documents.upload
  const imageMb = megabytes(DOCUMENT_LIMITS.imageMaxBytes)
  const pdfMb = megabytes(DOCUMENT_LIMITS.pdfMaxBytes)
  switch (failure) {
    case 'too_many_pages':
      return {
        kind: 'file',
        title: words.refusals.too_many_pages.title(DOCUMENT_LIMITS.pdfMaxPages),
        body: words.refusals.too_many_pages.body(DOCUMENT_LIMITS.maxImages),
      }
    case 'payload_too_large':
      return { kind: 'file', title: words.refusals.payload_too_large.title, body: words.refusals.payload_too_large.body(imageMb, pdfMb) }
    case 'encrypted':
    case 'unsupported_media_type':
    case 'refused':
      return { kind: 'file', ...words.refusals[failure] }
    case 'limit_reached':
      return { kind: 'banner', text: words.errors.limit_reached(DOCUMENT_LIMITS.perPet), offline: false }
    case 'offline':
      return { kind: 'banner', text: words.errors.offline, offline: true }
    default:
      return { kind: 'banner', text: words.errors[failure], offline: false }
  }
}
