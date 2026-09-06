/**
 * Where the Supabase session lives on the phone.
 *
 * Three things make this more than a thin wrapper around the keychain:
 *
 * 1. A real session does not fit. Android's SecureStore refuses values past
 *    2048 bytes, and a Supabase session is larger than that: measured against
 *    the staging project it came to 2291 bytes, of which the user object alone
 *    was 1158. Refusing the write meant nobody could stay signed in, so values
 *    are split across several keys and joined back on read.
 *
 * 2. A write can still fail. The keychain can be unavailable or locked. If a
 *    write fails silently the app ends up believing it is signed in while
 *    nothing was persisted, and the next cold start drops the user with no
 *    explanation. So a failed write is reported, and the caller signs out on
 *    purpose instead of drifting into that state. A failure part way through
 *    must also not destroy what was already stored, which is what the two
 *    generations below are for.
 *
 * 3. Signing out has to leave nothing behind. The next person to use the phone
 *    must not see the previous account's data — every chunk goes, not just the
 *    first one.
 */

/** The slice of expo-secure-store this needs, so tests need no native module. */
export type SecureStorage = {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

/** What Android's SecureStore refuses to exceed. */
export const SECURE_STORE_VALUE_LIMIT = 2048

/**
 * How much of a chunk is actual session text.
 *
 * Half the limit, because the limit applies to what Android stores, not to
 * what we hand over: the value is encrypted and base64-encoded on the way in,
 * and that inflates it by roughly a third plus an IV and a tag. Measuring the
 * plain text against 2048 would put values just under the limit over it once
 * encrypted, and the failure would look like the keychain misbehaving.
 */
export const CHUNK_BYTES = 1024

/**
 * A session needs three chunks today. The ceiling is not a fit for any real
 * value; it is there so a runaway caller cannot write megabytes into the
 * keychain one chunk at a time.
 */
export const MAX_CHUNKS = 32

export class SessionWriteError extends Error {
  constructor(
    readonly key: string,
    readonly cause: unknown,
  ) {
    super(`Could not persist ${key}`)
    this.name = 'SessionWriteError'
  }
}

export type SessionStorageOptions = {
  storage: SecureStorage
  /**
   * Called when the session could not be persisted. The app signs out here:
   * a session that exists only in memory is worse than none, because it
   * disappears on the next launch without the user being told.
   */
  onWriteFailure: (error: SessionWriteError) => void
}

export type SessionStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  /** Everything this module knows about, for a clean sign-out. */
  clearAll(): Promise<void>
}

/**
 * Two sets of chunk keys, used in turn. A write fills the generation that is
 * not in use and only then points the header at it, so a write that dies part
 * way through leaves the previous value whole rather than half-overwritten.
 */
const GENERATIONS = ['a', 'b'] as const
type Generation = (typeof GENERATIONS)[number]

const chunkKey = (key: string, generation: Generation, index: number) =>
  `${key}.${generation}.${index}`

/** Header stored under `key` itself: how many chunks, and which generation. */
type Header = { count: number; generation: Generation }

function parseHeader(raw: string | null): Header | null {
  if (raw === null) return null

  const [countText, generation] = raw.split(':')
  const count = Number(countText)
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null
  if (generation !== 'a' && generation !== 'b') return null

  return { count, generation }
}

/**
 * How many bytes this code point takes in UTF-8.
 *
 * Chunking on `String.length` would count UTF-16 units instead, and 2048
 * Cyrillic characters are 4096 bytes — the exact overrun this module exists to
 * prevent. Computed rather than taken from TextEncoder, which is not something
 * to depend on being present in every JavaScript runtime the app might use.
 */
function utf8Size(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

export function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const character of value) bytes += utf8Size(character.codePointAt(0) as number)
  return bytes
}

/** Splits on character boundaries so no chunk ends mid-character. */
function split(value: string): string[] {
  // An empty value is still one chunk: zero chunks would be indistinguishable
  // from nothing stored.
  if (value.length === 0) return ['']

  const chunks: string[] = []
  let chunk = ''
  let bytes = 0

  // Iterating a string yields whole code points, so a surrogate pair is never
  // torn in half.
  for (const character of value) {
    const size = utf8Size(character.codePointAt(0) as number)
    if (bytes + size > CHUNK_BYTES) {
      chunks.push(chunk)
      chunk = ''
      bytes = 0
    }
    chunk += character
    bytes += size
  }

  chunks.push(chunk)
  return chunks
}

export function createSessionStorage(options: SessionStorageOptions): SessionStorage {
  /**
   * Every key this instance knows to exist — written here, or found by a read.
   * Reads count too: after a cold start nothing has been written yet, and a
   * sign-out that only cleared this run's writes would leave the previous
   * run's chunks in the keychain.
   */
  const known = new Set<string>()

  /** A store that throws means no session, not a crash on launch. */
  async function read(key: string): Promise<string | null> {
    try {
      return await options.storage.getItemAsync(key)
    } catch {
      return null
    }
  }

  async function forget(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        known.delete(key)
        await options.storage.deleteItemAsync(key).catch(() => {})
      }),
    )
  }

  /** The chunk keys a stored value occupies. */
  function spread(key: string, header: Header): string[] {
    const keys: string[] = []
    for (let index = 0; index < header.count; index += 1) {
      keys.push(chunkKey(key, header.generation, index))
    }
    return keys
  }

  return {
    async getItem(key) {
      const header = parseHeader(await read(key))
      // A header that is missing, or not something this module wrote, means no
      // session — better than handing back a fragment the caller cannot parse.
      if (header === null) return null

      const parts: string[] = []
      for (const chunk of spread(key, header)) {
        const part = await read(chunk)
        // A missing chunk means the store is inconsistent — a half-written
        // session is worth no more than none.
        if (part === null) return null
        parts.push(part)
      }

      // Remember what this value occupies so a later sign-out can remove it,
      // even though this run never wrote it.
      known.add(key)
      for (const chunk of spread(key, header)) known.add(chunk)

      return parts.join('')
    },

    async setItem(key, value) {
      const chunks = split(value)
      if (chunks.length > MAX_CHUNKS) {
        options.onWriteFailure(
          new SessionWriteError(key, new Error(`value is ${utf8ByteLength(value)} bytes`)),
        )
        return
      }

      const previous = parseHeader(await read(key))
      // Fill the generation that is not in use, so the one the header still
      // points at stays readable until the very last step.
      const generation: Generation = previous?.generation === 'a' ? 'b' : 'a'

      const written: string[] = []
      try {
        for (const [index, chunk] of chunks.entries()) {
          const at = chunkKey(key, generation, index)
          await options.storage.setItemAsync(at, chunk)
          known.add(at)
          written.push(at)
        }

        // The switch. Until this line the stored value is still the old one.
        await options.storage.setItemAsync(key, `${chunks.length}:${generation}`)
        known.add(key)
      } catch (error) {
        // Roll back only what this write touched; the previous value is intact.
        await forget(written)
        options.onWriteFailure(new SessionWriteError(key, error))
        return
      }

      // The old generation is unreachable now, so it is only taking up space —
      // and it holds a session, which must not linger.
      if (previous) await forget(spread(key, previous))
    },

    async removeItem(key) {
      const header = parseHeader(await read(key))
      const tracked = [...known].filter(
        (stored) => stored === key || stored.startsWith(`${key}.`),
      )
      const listed = header ? spread(key, header) : []
      await forget([...new Set([key, ...tracked, ...listed])])
    },

    async clearAll() {
      await forget([...known])
    },
  }
}
