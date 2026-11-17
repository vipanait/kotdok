import type { DocumentKind, PetDocument } from '@lapka/contracts'
import { ApiError, apiFailure, type ApiClient } from '@lapka/shared'
import type { PreparedPage } from './prepare-pages'

/**
 * «Сохранить документ» (DOC-1): ask for the upload, write each page straight
 * to storage through its signed URL, then ask the server to check the files.
 * A file the server refuses removes the document there; one that did not
 * reach storage leaves a pending upload the server sweeps away. Either way
 * nothing half-saved is listed.
 *
 * A `complete` that got no answer (a timeout, a dropped connection) may
 * still have stored the document: it is read again before the failure is
 * said, so a retry does not save it twice.
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
  put: (url: string, headers: Record<string, string>, body: Blob) => Promise<boolean>
}

/** How long one page may take to reach storage: a photo of up to 5 MB, a PDF of up to 10 MB on a slow line. */
export const PUT_TIMEOUT_MS = 120_000

/** The browser's PUT to a signed storage URL, given up after `timeoutMs`. */
export async function putFile(url: string, headers: Record<string, string>, body: Blob, timeoutMs: number = PUT_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { method: 'PUT', headers, body, credentials: 'omit', signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function uploadDocument(
  api: UploadDeps,
  petId: string,
  { kind, title }: { kind: DocumentKind; title?: string },
  pages: PreparedPage[],
  onProgress: (progress: UploadProgress) => void = () => {},
): Promise<PetDocument> {
  onProgress({ step: 'start' })
  const name = title?.trim()
  const grant = await api.createDocument(petId, {
    kind,
    ...(name ? { title: name } : {}),
    files: pages.map((page) => ({ content_type: page.contentType, size_bytes: page.blob.size })),
  })
  for (const [index, upload] of grant.uploads.entries()) {
    onProgress({ step: 'page', n: index + 1, total: grant.uploads.length })
    if (!(await api.put(upload.url, upload.headers, pages[index].blob))) throw new PageUploadError()
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
