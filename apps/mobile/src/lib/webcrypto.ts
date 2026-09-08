/**
 * Enough of WebCrypto for PKCE to be PKCE.
 *
 * Hermes has no `crypto` at all. The Supabase auth client copes in two ways,
 * both bad: it hashes nothing and falls back to the `plain` challenge method,
 * so the challenge *is* the verifier and an intercepted authorization code can
 * be exchanged by whoever intercepted it; and it builds the verifier itself out
 * of `Math.random`, which is not a source of secrets. Everything keeps working,
 * so nothing looks broken.
 *
 * `expo-crypto` has both missing pieces. They are installed together on
 * purpose: the client decides which path to take by asking whether `crypto`
 * exists at all, so an object carrying one of them and not the other turns a
 * quiet weakness into a crash — which is exactly what happened when this file
 * first provided `subtle` alone.
 */

/** The shape of the two operations we provide. */
export type Digest = (algorithm: unknown, data: BufferSource) => Promise<ArrayBuffer>
export type GetRandomValues = <T extends ArrayBufferView>(array: T) => T

export type CryptoParts = { digest: Digest; getRandomValues: GetRandomValues }

/**
 * Whatever holds `crypto` — `globalThis` in the app, a plain object in tests.
 * Typed loosely on purpose: the DOM's own `Crypto` type declares `subtle` as
 * present and read-only, which is exactly the claim this file exists to doubt.
 */
type Scope = { crypto?: unknown }

type PartialCrypto = { subtle?: { digest?: unknown }; getRandomValues?: unknown }

/** SHA-256 under the names WebCrypto callers use for it. */
const SHA_256 = new Set(['SHA-256', 'sha-256', 'SHA256', 'sha256'])

export function isSha256(algorithm: unknown): boolean {
  const name = typeof algorithm === 'string' ? algorithm : (algorithm as { name?: string })?.name
  return typeof name === 'string' && SHA_256.has(name)
}

/**
 * Fills in what the runtime lacks, and leaves alone what it has.
 *
 * @returns which pieces were installed, so a caller — or a test — can tell
 *   "the runtime already had this" apart from "we provided it".
 */
export function installWebCrypto(
  scope: Scope,
  parts: CryptoParts,
): { subtle: boolean; getRandomValues: boolean } {
  const existing = scope.crypto as PartialCrypto | undefined

  const subtle = {
    async digest(algorithm: unknown, data: BufferSource): Promise<ArrayBuffer> {
      // Refusing the unknown beats returning a SHA-256 for something else: a
      // caller asking for SHA-512 must not silently get weaker bytes.
      if (!isSha256(algorithm)) {
        throw new Error('Only SHA-256 is available in this environment')
      }
      return parts.digest(algorithm, data)
    },
  }

  if (!existing) {
    scope.crypto = { subtle, getRandomValues: parts.getRandomValues }
    return { subtle: true, getRandomValues: true }
  }

  const installed = { subtle: false, getRandomValues: false }

  if (typeof existing.subtle?.digest !== 'function') {
    Object.defineProperty(existing, 'subtle', { value: subtle, configurable: true })
    installed.subtle = true
  }

  if (typeof existing.getRandomValues !== 'function') {
    Object.defineProperty(existing, 'getRandomValues', {
      value: parts.getRandomValues,
      configurable: true,
    })
    installed.getRandomValues = true
  }

  return installed
}
