import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A public page only needs to know whether somebody is signed in, to choose
 * between «Войти» and «Кабинет». That is answered from the token itself,
 * checked against Supabase's published keys, without the round trip to Auth
 * that `getUser()` makes — the proxy has already made that one.
 */
const getClaims = vi.fn()
const getUser = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getClaims, getUser } }),
}))

const { isSignedIn } = await import('@/server/auth/signed-in')

describe('isSignedIn', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon'
    getClaims.mockReset()
    getUser.mockReset()
  })

  it('is true when the cookie carries a verified token', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1', role: 'authenticated' } }, error: null })
    expect(await isSignedIn()).toBe(true)
  })

  it('is false without a token, or with one that does not verify', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    expect(await isSignedIn()).toBe(false)
    getClaims.mockResolvedValue({ data: null, error: { message: 'invalid' } })
    expect(await isSignedIn()).toBe(false)
  })

  it('never asks Auth for the user', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null })
    await isSignedIn()
    expect(getUser).not.toHaveBeenCalled()
  })
})
