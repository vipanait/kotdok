import { describe, expect, it } from 'vitest'
import { ApiContractError, ApiError, createApiClient, type FetchLike } from '@lapka/shared'
import { DELETION_RECEIPT_HEADER, IDEMPOTENCY_KEY_HEADER } from '@lapka/contracts'

type Call = { url: string; init?: Parameters<FetchLike>[1] }

function stub(response: { status?: number; body?: unknown }) {
  const calls: Call[] = []
  const status = response.status ?? 200

  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response.body,
    }
  }

  return { fetch, calls }
}

const profile = {
  id: '11111111-1111-4111-8111-000000000001',
  locale: 'ru',
  role: 'user',
  credits: 3,
  account_status: 'active',
  capabilities: { billing: false, extra_check_request: true },
}

function client(fetch: FetchLike, token: string | null = 'token-1') {
  return createApiClient({ baseUrl: 'https://api.test', getAccessToken: () => token, fetch })
}

describe('API client transport', () => {
  it('sends the bearer token to the versioned path', async () => {
    const { fetch, calls } = stub({ body: profile })

    await expect(client(fetch).getMe()).resolves.toEqual(profile)

    expect(calls[0].url).toBe('https://api.test/api/v1/me')
    expect(calls[0].init?.headers?.authorization).toBe('Bearer token-1')
  })

  it('omits the token when signed out', async () => {
    const { fetch, calls } = stub({ body: { status: 'ok' } })

    await client(fetch, null).health()

    expect(calls[0].init?.headers?.authorization).toBeUndefined()
  })

  it('never sends the session token on the receipt-authenticated route', async () => {
    const { fetch, calls } = stub({ body: { status: 'pending' } })

    await client(fetch).getAccountDeletionStatus('a'.repeat(64))

    expect(calls[0].init?.headers?.authorization).toBeUndefined()
    expect(calls[0].init?.headers?.[DELETION_RECEIPT_HEADER]).toBe('a'.repeat(64))
    // The secret must not end up in a URL, where it would reach logs.
    expect(calls[0].url).not.toContain('a'.repeat(64))
  })

  it('passes the idempotency key as a header', async () => {
    const { fetch, calls } = stub({
      status: 202,
      body: { job_id: '11111111-1111-4111-8111-00000000ab01', status_url: '/api/v1/check-jobs/x' },
    })

    await client(fetch).createCheck('key-12345678', { symptoms: 'coughing a lot' })

    expect(calls[0].init?.headers?.[IDEMPOTENCY_KEY_HEADER]).toBe('key-12345678')
  })

  it('builds a query string without dropping the page size', async () => {
    const { fetch, calls } = stub({ body: { items: [], next_cursor: null } })

    await client(fetch).listChecks({ limit: 5, pet_id: '11111111-1111-4111-8111-000000000002' })

    expect(calls[0].url).toContain('limit=5')
    expect(calls[0].url).toContain('pet_id=11111111-1111-4111-8111-000000000002')
  })

  it('returns nothing for a 204 without parsing a body', async () => {
    const { fetch } = stub({ status: 204, body: undefined })

    await expect(client(fetch).sendFeedback({ rating: 'liked' })).resolves.toBeUndefined()
  })
})

describe('API client error handling', () => {
  it('turns the error envelope into a typed error', async () => {
    const { fetch } = stub({
      status: 402,
      body: {
        error: { code: 'insufficient_credits', message: 'no checks left', request_id: 'req-9' },
      },
    })

    const error = await client(fetch).getMe().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'insufficient_credits', status: 402, requestId: 'req-9' })
  })

  it('does not invent a code when the error body is unrecognised', async () => {
    const { fetch } = stub({ status: 500, body: '<html>gateway</html>' })

    const error = await client(fetch).getMe().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('internal_error')
  })

  it('rejects a success response that does not match the contract', async () => {
    const { fetch } = stub({ body: { ...profile, credits: 'plenty' } })

    await expect(client(fetch).getMe()).rejects.toBeInstanceOf(ApiContractError)
  })

  it('rejects a profile carrying fields the contract forbids', async () => {
    const { fetch } = stub({ body: { ...profile, email: 'owner@example.com' } })

    await expect(client(fetch).getMe()).rejects.toBeInstanceOf(ApiContractError)
  })
})
