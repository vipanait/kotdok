import { describe, expect, it, vi } from 'vitest'
import { installWebCrypto, isSha256, type CryptoParts } from './webcrypto'

const bytes = new Uint8Array([1, 2, 3])

function parts(overrides: Partial<CryptoParts> = {}): CryptoParts {
  return {
    digest: vi.fn(async () => new ArrayBuffer(32)),
    getRandomValues: vi.fn((array) => array),
    ...overrides,
  }
}

describe('the WebCrypto stand-in', () => {
  it('provides both operations where Hermes has neither', async () => {
    const scope: Record<string, any> = {}
    const p = parts()

    expect(installWebCrypto(scope, p)).toEqual({ subtle: true, getRandomValues: true })

    await scope.crypto.subtle.digest('SHA-256', bytes)
    scope.crypto.getRandomValues(new Uint32Array(4))
    expect(p.digest).toHaveBeenCalledWith('SHA-256', bytes)
    expect(p.getRandomValues).toHaveBeenCalled()
  })

  it('never leaves crypto defined but half-equipped', () => {
    // The auth client asks whether `crypto` exists, then calls
    // getRandomValues on it. An object with only `subtle` crashes the sign-in.
    const scope: Record<string, any> = {}
    installWebCrypto(scope, parts())

    expect(typeof scope.crypto.getRandomValues).toBe('function')
    expect(typeof scope.crypto.subtle.digest).toBe('function')
  })

  it('keeps implementations the runtime already has', async () => {
    const realDigest = vi.fn(async () => new ArrayBuffer(32))
    const realRandom = vi.fn((array: ArrayBufferView) => array)
    const scope: Record<string, any> = {
      crypto: { subtle: { digest: realDigest }, getRandomValues: realRandom },
    }
    const p = parts()

    expect(installWebCrypto(scope, p)).toEqual({ subtle: false, getRandomValues: false })

    await scope.crypto.subtle.digest('SHA-256', bytes)
    scope.crypto.getRandomValues(new Uint32Array(1))
    expect(realDigest).toHaveBeenCalled()
    expect(realRandom).toHaveBeenCalled()
    expect(p.digest).not.toHaveBeenCalled()
    expect(p.getRandomValues).not.toHaveBeenCalled()
  })

  it('adds only the missing half to a crypto that has entropy but no subtle', async () => {
    const realRandom = vi.fn((array: ArrayBufferView) => array)
    const scope: Record<string, any> = { crypto: { getRandomValues: realRandom } }

    expect(installWebCrypto(scope, parts())).toEqual({ subtle: true, getRandomValues: false })
    expect(scope.crypto.getRandomValues).toBe(realRandom)
    expect(typeof scope.crypto.subtle.digest).toBe('function')
  })

  it('refuses an algorithm it cannot actually compute', async () => {
    const p = parts()
    const scope: Record<string, any> = {}
    installWebCrypto(scope, p)

    await expect(scope.crypto.subtle.digest('SHA-512', bytes)).rejects.toThrow(/SHA-256/)
    expect(p.digest).not.toHaveBeenCalled()
  })

  it('answers to the spellings callers use', () => {
    expect(isSha256('SHA-256')).toBe(true)
    expect(isSha256({ name: 'SHA-256' })).toBe(true)
    expect(isSha256('SHA-1')).toBe(false)
    expect(isSha256(undefined)).toBe(false)
  })
})
