import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/(backend)/api/credits/request-extra/route'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { submitExtraCheckRequest } from '@/server/extra-check/extra-check-service'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'

vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
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
