import {
  API_VERSION,
  AccountDeletionAcceptedSchema,
  AccountDeletionStatusSchema,
  ApiErrorEnvelopeSchema,
  CheckHistoryPageSchema,
  CheckJobAcceptedSchema,
  CheckJobStatusSchema,
  DELETION_RECEIPT_HEADER,
  ExtraCheckRequestStatusSchema,
  HealthSchema,
  IDEMPOTENCY_KEY_HEADER,
  PetSchema,
  PublicProfileSchema,
  ReauthProofSchema,
  SymptomCheckRecordSchema,
  UploadGrantSchema,
  type AccountDeletionRequest,
  type CheckCreateInput,
  type CheckHistoryQuery,
  type ErrorCode,
  type FeedbackInput,
  type PetCreateInput,
  type PetUpdateInput,
  type ProfileUpdateInput,
  type ReauthRequest,
  type UploadRequest,
} from '@lapka/contracts'
import { z } from 'zod'

/**
 * The API client both apps use. It is transport only: it adds the bearer token,
 * turns the error envelope into a typed error, and validates every response
 * against the contract before handing it back, so a server that starts
 * returning something else fails loudly at the boundary instead of somewhere
 * deep in a screen.
 *
 * Nothing here touches the DOM, React Native or Next.js.
 */

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly requestId: string | null = null,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** The response did not match the contract. Never surfaced as product data. */
export class ApiContractError extends Error {
  constructor(readonly path: string, readonly issues: unknown) {
    super(`Response from ${path} does not match the contract`)
    this.name = 'ApiContractError'
  }
}

/**
 * The slice of a response this client uses. Declared structurally so the
 * package needs neither DOM nor Node types: it has to compile for React Native
 * and for the server alike.
 */
export type HttpResponse = {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    /** Opaque here: typing it would drag in DOM or Node types. */
    signal?: unknown
  },
) => Promise<HttpResponse>

/**
 * A request that never answers.
 *
 * Distinct from every server error because nothing was decided: the write may
 * have landed or may not have. A caller must not treat it as "no".
 */
export class ApiTimeoutError extends Error {
  constructor(readonly path: string, readonly afterMs: number) {
    super(`No answer from ${path} after ${afterMs}ms`)
    this.name = 'ApiTimeoutError'
  }
}

/**
 * The timers and abort machinery, reached through `globalThis` so this package
 * still compiles with neither DOM nor Node types. All three exist in React
 * Native, in Node 18+ and in browsers; the client degrades to no timeout if a
 * runtime somehow lacks them, rather than failing to start.
 */
const platform = globalThis as {
  AbortController?: new () => { signal: unknown; abort(): void }
  setTimeout?: (handler: () => void, ms: number) => unknown
  clearTimeout?: (handle: unknown) => void
}

/** Long enough for a cold serverless start, short enough to not look frozen. */
export const DEFAULT_TIMEOUT_MS = 30_000

export type ApiClientOptions = {
  /** Origin of the API, without the version segment. */
  baseUrl: string
  /** Returns the current access token, or null when signed out. */
  getAccessToken?: () => Promise<string | null> | string | null
  /** Injectable for tests; defaults to the platform fetch. */
  fetch?: FetchLike
  /**
   * How long to wait for an answer before giving up. Without this a stalled
   * server leaves the app showing whatever it last knew, with no spinner ending
   * and no error — data that is merely old, presented as current.
   */
  timeoutMs?: number
}

type RequestOptions = {
  method?: string
  body?: unknown
  query?: Record<string, string | number | undefined>
  headers?: Record<string, string>
  /** Routes authenticated by something other than the session token. */
  anonymous?: boolean
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const base = `${baseUrl.replace(/\/$/, '')}/api/${API_VERSION}${path}`
  const pairs = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)

  return pairs.length ? `${base}?${pairs.join('&')}` : base
}

export function createApiClient(options: ApiClientOptions) {
  const configured = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch
  if (!configured) throw new Error('No fetch available; pass one in ApiClientOptions')
  const doFetch: FetchLike = configured

  async function call<T>(
    path: string,
    schema: z.ZodType<T> | null,
    request: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', ...request.headers }

    if (!request.anonymous) {
      const token = await options.getAccessToken?.()
      if (token) headers.authorization = `Bearer ${token}`
    }
    if (request.body !== undefined) headers['content-type'] = 'application/json'

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const controller = platform.AbortController ? new platform.AbortController() : null
    let timedOut = false
    const timer =
      controller && platform.setTimeout
        ? platform.setTimeout(() => {
            timedOut = true
            controller.abort()
          }, timeoutMs)
        : null

    let response: HttpResponse
    let payload: unknown
    try {
      response = await doFetch(buildUrl(options.baseUrl, path, request.query), {
        method: request.method ?? 'GET',
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller?.signal,
      })

      if (response.status === 204) return undefined as T

      // Reading the body is inside the same deadline: a server can answer with
      // headers and then stall, which looks identical to a hang from here.
      payload = await response.json().catch(() => null)
    } catch (cause) {
      // The abort surfaces as whatever the platform throws, so the flag is what
      // tells a timeout apart from an ordinary network failure.
      if (timedOut) throw new ApiTimeoutError(path, timeoutMs)
      throw cause
    } finally {
      if (timer !== null) platform.clearTimeout?.(timer)
    }

    if (!response.ok) {
      const envelope = ApiErrorEnvelopeSchema.safeParse(payload)
      if (!envelope.success) {
        throw new ApiError('internal_error', response.status, `Unrecognised error from ${path}`)
      }
      const { code, message, request_id, details } = envelope.data.error
      throw new ApiError(code, response.status, message, request_id, details)
    }

    if (!schema) return undefined as T

    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new ApiContractError(path, parsed.error.issues)
    return parsed.data
  }

  return {
    health: () => call('/health', HealthSchema, { anonymous: true }),

    getMe: () => call('/me', PublicProfileSchema),
    updateMe: (body: ProfileUpdateInput) =>
      call('/me', PublicProfileSchema, { method: 'PATCH', body }),

    listPets: () => call('/pets', z.array(PetSchema)),
    createPet: (body: PetCreateInput) => call('/pets', PetSchema, { method: 'POST', body }),
    getPet: (id: string) => call(`/pets/${id}`, PetSchema),
    updatePet: (id: string, body: PetUpdateInput) =>
      call(`/pets/${id}`, PetSchema, { method: 'PATCH', body }),
    deletePet: (id: string) => call<void>(`/pets/${id}`, null, { method: 'DELETE' }),

    requestUploads: (body: UploadRequest) =>
      call('/uploads', UploadGrantSchema, { method: 'POST', body }),

    listChecks: (query: CheckHistoryQuery = {}) =>
      call('/checks', CheckHistoryPageSchema, {
        query: { pet_id: query.pet_id, limit: query.limit, cursor: query.cursor },
      }),
    getCheck: (id: string) => call(`/checks/${id}`, SymptomCheckRecordSchema),

    /**
     * The key must be generated and stored before sending, so a lost response
     * can be recovered by repeating the very same request.
     */
    createCheck: (idempotencyKey: string, body: CheckCreateInput) =>
      call('/checks', CheckJobAcceptedSchema, {
        method: 'POST',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),
    getCheckJob: (jobId: string) => call(`/check-jobs/${jobId}`, CheckJobStatusSchema),

    getExtraCheckRequest: () => call('/credits/extra-request', ExtraCheckRequestStatusSchema),
    requestExtraCheck: () =>
      call('/credits/extra-request', ExtraCheckRequestStatusSchema, { method: 'POST' }),

    sendFeedback: (body: FeedbackInput) => call<void>('/feedback', null, { method: 'POST', body }),

    /**
     * Asks for a proof that the person authenticated a moment ago.
     *
     * Fails with `reauth_required` when they did not — which is not an error to
     * show, but an instruction: send them back through sign-in and try again.
     */
    requestReauth: (body: ReauthRequest) =>
      call('/auth/reauth', ReauthProofSchema, { method: 'POST', body }),

    requestAccountDeletion: (body: AccountDeletionRequest) =>
      call('/account-deletion', AccountDeletionAcceptedSchema, { method: 'POST', body }),

    /**
     * Works without a session: the receipt secret is the only credential, and it
     * travels in a header so it never lands in a URL or a log.
     */
    getAccountDeletionStatus: (receiptSecret: string) =>
      call('/account-deletion/status', AccountDeletionStatusSchema, {
        anonymous: true,
        headers: { [DELETION_RECEIPT_HEADER]: receiptSecret },
      }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
