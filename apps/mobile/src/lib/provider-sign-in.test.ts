import { describe, expect, it, vi } from 'vitest'
import { PROVIDER_RETURN_URL } from './auth-links'
import { createProviderSignIn, type ProviderSignInDeps } from './provider-sign-in'

/** The happy path, with the pieces a test wants to replace passed in. */
function deps(overrides: Partial<ProviderSignInDeps> = {}): ProviderSignInDeps {
  return {
    authorize: vi.fn(async () => ({ url: 'https://oauth.yandex.ru/authorize?x=1', error: null })),
    openBrowser: vi.fn(async () => ({ type: 'success', url: `${PROVIDER_RETURN_URL}?code=abc` })),
    exchangeCode: vi.fn(async () => ({ error: null })),
    ...overrides,
  }
}

describe('signing in with a provider', () => {
  it('exchanges the returned code for a session', async () => {
    const d = deps()

    await expect(createProviderSignIn(d)('custom:yandex')).resolves.toEqual({ kind: 'session' })
    expect(d.authorize).toHaveBeenCalledWith('custom:yandex', PROVIDER_RETURN_URL)
    expect(d.exchangeCode).toHaveBeenCalledWith('abc')
  })

  it('treats a closed browser as a cancellation, not a failure', async () => {
    const d = deps({ openBrowser: vi.fn(async () => ({ type: 'cancel' })) })

    await expect(createProviderSignIn(d)('google')).resolves.toEqual({ kind: 'cancelled' })
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('treats a dismissed browser the same way', async () => {
    const d = deps({ openBrowser: vi.fn(async () => ({ type: 'dismiss' })) })

    await expect(createProviderSignIn(d)('google')).resolves.toEqual({ kind: 'cancelled' })
  })

  it('fails when the provider refuses', async () => {
    const d = deps({
      openBrowser: vi.fn(async () => ({
        type: 'success',
        url: `${PROVIDER_RETURN_URL}?error=access_denied&error_description=Denied`,
      })),
    })

    expect((await createProviderSignIn(d)('google')).kind).toBe('failed')
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('never exchanges a code that came back to somebody else’s address', async () => {
    const d = deps({
      openBrowser: vi.fn(async () => ({
        type: 'success',
        url: 'https://evil.example.com/auth/provider?code=abc',
      })),
    })

    expect((await createProviderSignIn(d)('google')).kind).toBe('failed')
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('fails when the return carries no code at all', async () => {
    const d = deps({
      openBrowser: vi.fn(async () => ({ type: 'success', url: PROVIDER_RETURN_URL })),
    })

    expect((await createProviderSignIn(d)('custom:yandex')).kind).toBe('failed')
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('fails without opening a browser when authorization cannot start', async () => {
    const d = deps({
      authorize: vi.fn(async () => ({ url: null, error: { message: 'provider is not enabled' } })),
    })

    expect((await createProviderSignIn(d)('custom:yandex')).kind).toBe('failed')
    expect(d.openBrowser).not.toHaveBeenCalled()
  })

  it('fails when the code is refused, and tries exactly once', async () => {
    const d = deps({ exchangeCode: vi.fn(async () => ({ error: { message: 'invalid request' } })) })

    expect((await createProviderSignIn(d)('google')).kind).toBe('failed')
    expect(d.exchangeCode).toHaveBeenCalledTimes(1)
  })

  it('tells the user something readable rather than the provider’s wording', async () => {
    const d = deps({ exchangeCode: vi.fn(async () => ({ error: { message: 'invalid request' } })) })

    const outcome = await createProviderSignIn(d)('google')

    expect(outcome).toEqual({ kind: 'failed', message: expect.not.stringContaining('invalid') })
  })
})
