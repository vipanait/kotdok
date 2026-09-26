import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { POST } from '@/app/(backend)/api/consent/route'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { recordConsent } from '@/server/consent/consent-service'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'

vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn(() => ({})) }))
vi.mock('@/server/consent/consent-service', () => ({ recordConsent: vi.fn() }))

const csrfToken = 'test-csrf-token'

function consentRequest(body: unknown, withCsrf = true) {
  return new NextRequest('http://test.local/api/consent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://test.local',
      ...(withCsrf ? { cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`, [CSRF_HEADER_NAME]: csrfToken } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('the site consent route', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockReset()
    vi.mocked(recordConsent).mockReset()
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(recordConsent).mockResolvedValue({ ok: true })
  })

  it('refuses without the CSRF token', async () => {
    const response = await POST(consentRequest({ version: PD_CONSENT_VERSION }, false))
    expect(response.status).toBe(403)
    expect(recordConsent).not.toHaveBeenCalled()
  })

  it('refuses a visitor who is not signed in', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)
    expect((await POST(consentRequest({ version: PD_CONSENT_VERSION }))).status).toBe(401)
  })

  it('refuses a body that is not just the edition', async () => {
    expect((await POST(consentRequest({ version: PD_CONSENT_VERSION, source: 'ios' }))).status).toBe(400)
    expect((await POST(consentRequest({}))).status).toBe(400)
    expect(recordConsent).not.toHaveBeenCalled()
  })

  it('refuses a stale edition', async () => {
    vi.mocked(recordConsent).mockResolvedValue({ ok: false, reason: 'stale_version' })
    expect((await POST(consentRequest({ version: '2020-01-01' }))).status).toBe(400)
  })

  it('records consent from the site as web', async () => {
    const response = await POST(consentRequest({ version: PD_CONSENT_VERSION }))

    expect(response.status).toBe(200)
    expect(recordConsent).toHaveBeenCalledWith(expect.anything(), 'u1', {
      version: PD_CONSENT_VERSION,
      source: 'web',
    })
  })
})
