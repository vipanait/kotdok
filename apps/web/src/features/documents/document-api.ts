import type { z } from 'zod'
import {
  API_VERSION,
  ApiErrorEnvelopeReadSchema,
  DocumentGrantSchema,
  DocumentListSchema,
  FEATURE_PET_DOCUMENTS,
  FEATURES_HEADER,
  PetDocumentSchema,
  type DocumentCreateInput,
  type DocumentGrant,
  type DocumentList,
  type DocumentPatch,
  type PetDocument,
} from '@lapka/contracts'
import { ApiContractError, ApiError, ApiTimeoutError, DEFAULT_TIMEOUT_MS } from '@lapka/shared'
import { createClient } from '@/features/auth/lib/supabase-browser'

/**
 * The pet documents routes of the v1 API, as the site's pages call them
 * (DOC-1). The shared client gets its document methods with the app (DOC-3);
 * until then the site reads them here, the same way: a Bearer token from the
 * site's Supabase session, never a cookie, never the HTTP cache. Failures are
 * the shared client's errors, so `apiFailure` reads them as it reads any
 * other — a 404 is a document (or pet) that is not there, a 401 a session
 * that ended.
 */
export type DocumentApi = {
  list: (petId: string) => Promise<DocumentList>
  read: (petId: string, docId: string) => Promise<PetDocument>
  create: (petId: string, input: DocumentCreateInput) => Promise<DocumentGrant>
  complete: (petId: string, docId: string) => Promise<PetDocument>
  patch: (petId: string, docId: string, patch: DocumentPatch) => Promise<PetDocument>
  remove: (petId: string, docId: string) => Promise<void>
  /** One file straight to storage through its signed URL; false when it did not land. */
  put: (url: string, headers: Record<string, string>, body: Blob) => Promise<boolean>
}

let api: DocumentApi | null = null

export function documentApi(): DocumentApi {
  if (api) return api
  const supabase = createClient()

  async function call<T>(path: string, schema: z.ZodType<T> | null, method = 'GET', body?: unknown): Promise<T> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { accept: 'application/json', [FEATURES_HEADER]: FEATURE_PET_DOCUMENTS }
    if (token) headers.authorization = `Bearer ${token}`
    if (body !== undefined) headers['content-type'] = 'application/json'

    const controller = new AbortController()
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, DEFAULT_TIMEOUT_MS)
    let response: Response
    let payload: unknown
    try {
      response = await fetch(`/api/${API_VERSION}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
      })
      if (response.status === 204) return undefined as T
      payload = await response.json().catch(() => null)
    } catch (cause) {
      if (timedOut) throw new ApiTimeoutError(path, DEFAULT_TIMEOUT_MS)
      throw cause
    } finally {
      window.clearTimeout(timer)
    }

    if (!response.ok) {
      const envelope = ApiErrorEnvelopeReadSchema.safeParse(payload)
      if (!envelope.success) throw new ApiError('internal_error', response.status, `Unrecognised error from ${path}`)
      const { code, message, request_id, details } = envelope.data.error
      throw new ApiError(code, response.status, message || `Error ${response.status} (${code}) from ${path}`, request_id ?? null, details)
    }
    if (!schema) return undefined as T
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new ApiContractError(path, parsed.error.issues)
    return parsed.data
  }

  const docs = (petId: string) => `/pets/${petId}/documents`

  api = {
    list: (petId) => call(docs(petId), DocumentListSchema),
    read: (petId, docId) => call(`${docs(petId)}/${docId}`, PetDocumentSchema),
    create: (petId, input) => call(docs(petId), DocumentGrantSchema, 'POST', input),
    complete: (petId, docId) => call(`${docs(petId)}/${docId}/complete`, PetDocumentSchema, 'POST'),
    patch: (petId, docId, patch) => call(`${docs(petId)}/${docId}`, PetDocumentSchema, 'PATCH', patch),
    remove: (petId, docId) => call<void>(`${docs(petId)}/${docId}`, null, 'DELETE'),
    put: async (url, headers, body) => {
      try {
        const response = await fetch(url, { method: 'PUT', headers, body, credentials: 'omit' })
        return response.ok
      } catch {
        return false
      }
    },
  }
  return api
}
