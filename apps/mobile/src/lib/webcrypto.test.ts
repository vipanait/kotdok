import { describe, expect, it, vi } from 'vitest'
import { installSubtleDigest, isSha256 } from './webcrypto'

const bytes = new Uint8Array([1, 2, 3])

describe('the WebCrypto stand-in', () => {
  it('installs a digest where Hermes has none', async () => {
    const scope: Record<string, any> = {}
    const digest = vi.fn(async () => new ArrayBuffer(32))

    expect(installSubtleDigest(scope, digest)).toBe(true)
    await scope.crypto.subtle.digest('SHA-256', bytes)
    expect(digest).toHaveBeenCalledWith('SHA-256', bytes)
  })

  it('keeps an existing implementation', async () => {
    const real = vi.fn(async () => new ArrayBuffer(32))
    const scope: Record<string, any> = { crypto: { subtle: { digest: real } } }
    const ours = vi.fn(async () => new ArrayBuffer(32))

    expect(installSubtleDigest(scope, ours)).toBe(false)
    await scope.crypto.subtle.digest('SHA-256', bytes)
    expect(real).toHaveBeenCalled()
    expect(ours).not.toHaveBeenCalled()
  })

  it('adds itself to a crypto object that only lacks subtle', async () => {
    const getRandomValues = vi.fn()
    const scope: Record<string, any> = { crypto: { getRandomValues } }

    expect(installSubtleDigest(scope, vi.fn(async () => new ArrayBuffer(32)))).toBe(true)
    // The rest of the object survives: the runtime's own entropy stays in place.
    expect(scope.crypto.getRandomValues).toBe(getRandomValues)
  })

  it('refuses an algorithm it cannot actually compute', async () => {
    const digest = vi.fn(async () => new ArrayBuffer(64))
    const scope: Record<string, any> = {}
    installSubtleDigest(scope, digest)

    await expect(scope.crypto.subtle.digest('SHA-512', bytes)).rejects.toThrow(/SHA-256/)
    expect(digest).not.toHaveBeenCalled()
  })

  it('answers to the spellings callers use', () => {
    expect(isSha256('SHA-256')).toBe(true)
    expect(isSha256({ name: 'SHA-256' })).toBe(true)
    expect(isSha256('SHA-1')).toBe(false)
    expect(isSha256(undefined)).toBe(false)
  })
})
