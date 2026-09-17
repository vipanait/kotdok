import { describe, expect, it, vi } from 'vitest'
import { createAppleSignIn, usesNativeAppleSignIn, type AppleSignInDeps } from './apple-sign-in'
import { ru } from '@/i18n/ru'

const messages = ru.provider
const TOKEN = 'header.payload.signature'

const sha256 = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

/** What expo-apple-authentication rejects with: an Error carrying a string code. */
function nativeError(code: string) {
  return Object.assign(new Error(code), { code })
}

/** The happy path, with the pieces a test wants to replace passed in. */
function deps(overrides: Partial<AppleSignInDeps> = {}): AppleSignInDeps {
  let issued = 0
  return {
    randomNonce: vi.fn(() => `nonce-${++issued}`),
    sha256: vi.fn(sha256),
    requestCredential: vi.fn(async () => ({ identityToken: TOKEN })),
    signInWithIdToken: vi.fn(async () => ({ error: null })),
    reportFailure: vi.fn(),
    ...overrides,
  }
}

describe('signing in with Apple on the device', () => {
  it('hands the token and the raw nonce to Supabase', async () => {
    const d = deps()

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({ kind: 'session' })
    expect(d.signInWithIdToken).toHaveBeenCalledWith(TOKEN, 'nonce-1')
  })

  it('gives Apple the hash of the nonce, never the nonce itself', async () => {
    const d = deps()

    await createAppleSignIn(d)(messages)

    expect(d.requestCredential).toHaveBeenCalledWith(await sha256('nonce-1'))
    expect(d.requestCredential).not.toHaveBeenCalledWith('nonce-1')
  })

  it('makes a new nonce for every attempt', async () => {
    const d = deps()
    const signIn = createAppleSignIn(d)

    await signIn(messages)
    await signIn(messages)

    expect(d.requestCredential).toHaveBeenNthCalledWith(1, await sha256('nonce-1'))
    expect(d.requestCredential).toHaveBeenNthCalledWith(2, await sha256('nonce-2'))
    expect(d.signInWithIdToken).toHaveBeenNthCalledWith(2, TOKEN, 'nonce-2')
  })

  it('treats a closed sheet as a cancellation and never reaches Supabase', async () => {
    const d = deps({
      requestCredential: vi.fn(async () => {
        throw nativeError('ERR_REQUEST_CANCELED')
      }),
    })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({ kind: 'cancelled' })
    expect(d.signInWithIdToken).not.toHaveBeenCalled()
    expect(d.reportFailure).not.toHaveBeenCalled()
  })

  it('fails to start on any other Apple error, and reports its code', async () => {
    const d = deps({
      requestCredential: vi.fn(async () => {
        throw nativeError('ERR_REQUEST_FAILED')
      }),
    })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({
      kind: 'failed',
      message: messages.failedToStart,
    })
    expect(d.signInWithIdToken).not.toHaveBeenCalled()
    expect(d.reportFailure).toHaveBeenCalledWith('apple', 'ERR_REQUEST_FAILED')
  })

  it('fails to start on an error that carries no code', async () => {
    const d = deps({
      requestCredential: vi.fn(async () => {
        throw new Error('boom')
      }),
    })

    expect((await createAppleSignIn(d)(messages)).kind).toBe('failed')
    expect(d.reportFailure).toHaveBeenCalledWith('apple', 'unknown')
  })

  it('fails to finish when Apple returns no token, without asking Supabase', async () => {
    const d = deps({ requestCredential: vi.fn(async () => ({ identityToken: null })) })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({
      kind: 'failed',
      message: messages.failedToFinish,
    })
    expect(d.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('fails to finish when Supabase refuses the token, and tries exactly once', async () => {
    const d = deps({
      signInWithIdToken: vi.fn(async () => ({ error: { message: 'Nonces mismatch' } })),
    })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({
      kind: 'failed',
      message: messages.failedToFinish,
    })
    expect(d.signInWithIdToken).toHaveBeenCalledTimes(1)
    expect(d.reportFailure).toHaveBeenCalledWith('supabase', 'Nonces mismatch')
  })

  it('never puts the token or the nonce into a report', async () => {
    const reports: string[] = []
    const reportFailure = (stage: string, detail: string) => reports.push(`${stage} ${detail}`)

    await createAppleSignIn(
      deps({ reportFailure, requestCredential: vi.fn(async () => { throw nativeError('ERR_INVALID_RESPONSE') }) }),
    )(messages)
    await createAppleSignIn(
      deps({ reportFailure, requestCredential: vi.fn(async () => ({ identityToken: null })) }),
    )(messages)
    await createAppleSignIn(
      deps({ reportFailure, signInWithIdToken: vi.fn(async () => ({ error: { message: 'Bad ID token' } })) }),
    )(messages)

    expect(reports).toHaveLength(3)
    for (const report of reports) {
      expect(report).not.toContain(TOKEN)
      expect(report).not.toContain('nonce-')
    }
  })
})

describe('which way Apple is reached', () => {
  it('uses the system sheet only on iOS', () => {
    expect(usesNativeAppleSignIn('ios')).toBe(true)
    expect(usesNativeAppleSignIn('android')).toBe(false)
    expect(usesNativeAppleSignIn('web')).toBe(false)
  })
})
