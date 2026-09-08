/**
 * Enough of WebCrypto for PKCE to be PKCE.
 *
 * Hermes has no `crypto.subtle`. Supabase's auth client checks for it before
 * hashing the PKCE verifier and, finding nothing, falls back to the `plain`
 * challenge method — the challenge then *is* the verifier, and an intercepted
 * authorization code can be exchanged by whoever intercepted it. The client
 * says so in a warning that is easy to miss, and everything keeps working, so
 * nothing looks broken.
 *
 * `expo-crypto` can do the one thing that is missing: SHA-256 over bytes. This
 * installs it as `crypto.subtle.digest` and leaves the rest of the API absent
 * rather than pretending to implement it.
 */

/** The shape of the one operation we provide. */
export type Digest = (algorithm: unknown, data: BufferSource) => Promise<ArrayBuffer>

/**
 * Whatever holds `crypto` — `globalThis` in the app, a plain object in tests.
 * Typed loosely on purpose: the DOM's own `Crypto` type declares `subtle` as
 * present and read-only, which is exactly the claim this file exists to doubt.
 */
type Scope = { crypto?: unknown }

/** SHA-256 under the names WebCrypto callers use for it. */
const SHA_256 = new Set(['SHA-256', 'sha-256', 'SHA256', 'sha256'])

export function isSha256(algorithm: unknown): boolean {
  const name = typeof algorithm === 'string' ? algorithm : (algorithm as { name?: string })?.name
  return typeof name === 'string' && SHA_256.has(name)
}

/**
 * Installs `crypto.subtle.digest` on the given scope when it is missing.
 *
 * @returns true when it installed something, false when a real implementation
 *   was already there — a runtime that has WebCrypto keeps it.
 */
export function installSubtleDigest(scope: Scope, digest: Digest): boolean {
  const existing = scope.crypto as { subtle?: { digest?: unknown } } | undefined
  if (typeof existing?.subtle?.digest === 'function') return false

  const subtle = {
    async digest(algorithm: unknown, data: BufferSource): Promise<ArrayBuffer> {
      // Refusing the unknown beats returning a SHA-256 for something else: a
      // caller asking for SHA-512 must not silently get weaker bytes.
      if (!isSha256(algorithm)) {
        throw new Error('Only SHA-256 is available in this environment')
      }
      return digest(algorithm, data)
    },
  }

  if (existing) {
    Object.defineProperty(existing, 'subtle', { value: subtle, configurable: true })
  } else {
    scope.crypto = { subtle }
  }

  return true
}
