import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * How the proxy decides who is signed in.
 *
 * The proxy runs in the Vercel region nearest the visitor (Stockholm for
 * traffic through the Russian proxy), far from Supabase in Tokyo, so a network
 * call per page cost 0.35–4.8 s. Cabinet pages are therefore gated on the
 * session token checked locally (`getClaims`); the pages ask Auth themselves
 * (`requireCabinet`, `loadAdminUser`). `/login` and `/register` still ask Auth:
 * sending someone away from sign-in on a token whose session was revoked would
 * bounce them between /login and /dashboard until it expired.
 */

const auth = {
  getClaims: vi.fn(),
  getUser: vi.fn(),
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth })),
}))

const { proxy } = await import('@/proxy')

const SIGNED_IN = { data: { claims: { sub: 'user-1' } }, error: null }
const NO_SESSION = { data: null, error: null }
const USER = { data: { user: { id: 'user-1' } }, error: null }
const NO_USER = { data: { user: null }, error: { message: 'Session from session_id claim in JWT does not exist' } }

function page(path: string) {
  return proxy(new NextRequest(`http://localhost:3100${path}`))
}

describe('who the proxy takes to be signed in', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon'
    auth.getClaims.mockReset()
    auth.getUser.mockReset()
  })

  it('lets a cabinet page through on a valid token, without asking Auth over the network', async () => {
    auth.getClaims.mockResolvedValue(SIGNED_IN)
    const response = await page('/admin/statistics/users?days=7')
    expect(response.headers.get('location')).toBeNull()
    expect(auth.getClaims).toHaveBeenCalled()
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  it('sends a visitor without a valid token to sign in, and back to the same page', async () => {
    auth.getClaims.mockResolvedValue(NO_SESSION)
    const response = await page('/admin/statistics/checks?days=7&filter=urgent')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'http://localhost:3100/login?next=%2Fadmin%2Fstatistics%2Fchecks%3Fdays%3D7%26filter%3Durgent',
    )
  })

  it('treats a token that fails the check as no session', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { message: 'Invalid JWT signature' } })
    const response = await page('/dashboard')
    expect(response.headers.get('location')).toBe('http://localhost:3100/login?next=%2Fdashboard')
  })

  it.each(['/login', '/register'])('asks Auth before sending someone away from %s, so a revoked session does not loop', async (path) => {
    auth.getClaims.mockResolvedValue(SIGNED_IN)
    auth.getUser.mockResolvedValue(NO_USER)
    const response = await page(path)
    expect(response.headers.get('location')).toBeNull()
    expect(auth.getUser).toHaveBeenCalled()
  })

  it.each(['/login', '/register'])('still sends a signed-in visitor from %s to the dashboard', async (path) => {
    auth.getUser.mockResolvedValue(USER)
    const response = await page(path)
    expect(response.headers.get('location')).toBe('http://localhost:3100/dashboard')
  })
})
