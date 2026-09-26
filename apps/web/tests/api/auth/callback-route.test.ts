import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { GET } from '@/app/(backend)/auth/callback/route'
import { exchangeCodeForSession } from '@/server/auth/auth-callback'
import { recordProviderConsent } from '@/server/consent/callback-consent'

vi.mock('@/server/auth/auth-callback', async () => ({
  exchangeCodeForSession: vi.fn(),
  getSafeNextPath: (await import('@/shared/security/safe-next')).getSafeNextPath,
}))
vi.mock('@/server/consent/callback-consent', () => ({ recordProviderConsent: vi.fn(async () => {}) }))

function callback(query: string) {
  return new NextRequest(`http://test.local/auth/callback?${query}`, {
    headers: { cookie: `lapka_pd_consent=${PD_CONSENT_VERSION}` },
  })
}

function clearsConsentCookie(response: Response): boolean {
  return response.headers.getSetCookie().some(
    (cookie) => cookie.startsWith('lapka_pd_consent=;') && /Max-Age=0/i.test(cookie),
  )
}

describe('the auth callback and the carried consent', () => {
  beforeEach(() => {
    vi.mocked(exchangeCodeForSession).mockReset()
    vi.mocked(recordProviderConsent).mockClear()
  })

  it('records the carried consent for the signed-in user and clears the cookie', async () => {
    vi.mocked(exchangeCodeForSession).mockResolvedValue({ data: { user: { id: 'u1' } }, error: null } as never)

    const response = await GET(callback('code=abc&next=/pets'))

    expect(recordProviderConsent).toHaveBeenCalledWith(PD_CONSENT_VERSION, 'u1')
    expect(response.headers.get('location')).toBe('http://test.local/pets')
    expect(clearsConsentCookie(response)).toBe(true)
  })

  it('clears the cookie when the sign-in failed, so a later sign-in cannot spend it', async () => {
    vi.mocked(exchangeCodeForSession).mockResolvedValue({ data: { user: null }, error: new Error('no') } as never)

    const response = await GET(callback('code=abc'))

    expect(recordProviderConsent).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toContain('/login?error=auth_failed')
    expect(clearsConsentCookie(response)).toBe(true)
  })

  it('does not fail a sign-in when recording the consent throws', async () => {
    vi.mocked(exchangeCodeForSession).mockResolvedValue({ data: { user: { id: 'u1' } }, error: null } as never)
    vi.mocked(recordProviderConsent).mockRejectedValue(new Error('db down'))

    const response = await GET(callback('code=abc&next=/pets'))

    expect(response.headers.get('location')).toBe('http://test.local/pets')
  })
})
