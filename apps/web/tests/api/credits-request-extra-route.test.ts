import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/(backend)/api/credits/request-extra/route'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { submitExtraCheckRequest } from '@/server/extra-check/extra-check-service'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'

vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/consent/consent-service', () => ({ owesConsent: vi.fn(async () => false) }))
vi.mock('@/server/extra-check/extra-check-service', () => ({
  submitExtraCheckRequest: vi.fn(),
}))

const csrfToken = 'test-csrf-token'

function csrfRequest() {
  return new NextRequest('http://test.local/api/credits/request-extra', {
    method: 'POST',
    headers: {
      origin: 'http://test.local',
      cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
      [CSRF_HEADER_NAME]: csrfToken,
    },
  })
}

describe('credits/request-extra route', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockReset()
    vi.mocked(submitExtraCheckRequest).mockReset()
  })

  it('returns 401 for unauthorized user', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await POST(csrfRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 200 and request id when request is created', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(submitExtraCheckRequest).mockResolvedValue({ requestId: 'req-10' })

    const response = await POST(csrfRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'pending',
      request_id: 'req-10',
    })
  })

  it('answers an unexpected failure with a code, not the storage error', async () => {
    // A PostgREST or Telegram message names tables, constraints and hosts. The
    // reader gets nothing actionable from it, and neither should anyone else.
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(submitExtraCheckRequest).mockRejectedValue(
      new Error('insert or update on table "extra_check_requests" violates foreign key'),
    )

    const response = await POST(csrfRequest())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'request_failed' })
  })

  it('keeps the dispatch failure short of the provider’s own words', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(submitExtraCheckRequest).mockRejectedValue(
      new Error('telegram_dispatch_failed:telegram_api_error:chat not found for bot 12345'),
    )

    const response = await POST(csrfRequest())

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'telegram_dispatch_failed' })
  })

  it('returns 409 for existing pending request', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(submitExtraCheckRequest).mockRejectedValue(new Error('pending_request_exists'))

    const response = await POST(csrfRequest())

    expect(response.status).toBe(409)
  })

  it('returns 403 when CSRF token is missing', async () => {
    const response = await POST(new NextRequest('http://test.local/api/credits/request-extra', { method: 'POST' }))

    expect(response.status).toBe(403)
    expect(getAuthUser).not.toHaveBeenCalled()
  })
})
