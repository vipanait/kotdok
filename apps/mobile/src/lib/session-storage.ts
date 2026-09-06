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
 *    purpose instead of drifting into that state.
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

/** Android's SecureStore rejects values longer than this, so a chunk is at most this long. */
export const SECURE_STORE_VALUE_LIMIT = 2048

/**
 * A session needs two chunks today. The ceiling is not a fit for any real
 * value; it is there so a runaway caller cannot write megabytes into the
 * keychain one 2 KB key at a time.
 */
export const MAX_CHUNKS = 16

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

/** Key holding the chunk count. Chunks themselves live at `${key}.0`, `${key}.1`, … */
const chunkKey = (key: string, index: number) => `${key}.${index}`

function split(value: string): string[] {
  // An empty value is still one chunk: zero chunks would be indistinguishable
  // from nothing stored.
  if (value.length === 0) return ['']

  const chunks: string[] = []
  for (let at = 0; at < value.length; at += SECURE_STORE_VALUE_LIMIT) {
    chunks.push(value.slice(at, at + SECURE_STORE_VALUE_LIMIT))
  }
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

  /** The keys a value occupies, according to the count stored under `key`. */
  function spread(key: string, count: number): string[] {
    const keys = [key]
    for (let index = 0; index < count; index += 1) keys.push(chunkKey(key, index))
    return keys
  }

  /** Reads the chunk count, or null when `key` holds nothing this module wrote. */
  function countOf(header: string | null): number | null {
    if (header === null) return null
    const count = Number(header)
    return Number.isInteger(count) && count >= 1 && count <= MAX_CHUNKS ? count : null
  }

  return {
    async getItem(key) {
      const count = countOf(await read(key))
      // A header that is missing, or not something this module wrote, means no
      // session — better than handing back a fragment the caller cannot parse.
      if (count === null) return null

      const parts: string[] = []
      for (let index = 0; index < count; index += 1) {
        const part = await read(chunkKey(key, index))
        // A missing chunk means the store is inconsistent — a half-written
        // session is worth no more than none.
        if (part === null) return null
        parts.push(part)
      }

      // Remember what this value occupies so a later sign-out can remove it,
      // even though this run never wrote it.
      for (const stored of spread(key, count)) known.add(stored)

      return parts.join('')
    },

    async setItem(key, value) {
      const chunks = split(value)
      if (chunks.length > MAX_CHUNKS) {
        options.onWriteFailure(
          new SessionWriteError(key, new Error(`value is ${value.length} bytes`)),
        )
        return
      }

      // Anything the previous value spilled into must go, or a shorter value
      // would leave a longer one's tail behind for the next read to find.
      const previous = countOf(await read(key))
      await forget(previous === null ? [key] : spread(key, previous))

      const done: string[] = []
      try {
        // Chunks first, the count last: until the count is written a reader
        // sees nothing, so a failure part way through cannot be mistaken for a
        // whole session.
        for (const [index, chunk] of chunks.entries()) {
          const at = chunkKey(key, index)
          await options.storage.setItemAsync(at, chunk)
          known.add(at)
          done.push(at)
        }

        await options.storage.setItemAsync(key, String(chunks.length))
        known.add(key)
      } catch (error) {
        await forget([...done, key])
        options.onWriteFailure(new SessionWriteError(key, error))
      }
    },

    async removeItem(key) {
      const count = countOf(await read(key))
      const tracked = [...known].filter((stored) => stored === key || stored.startsWith(`${key}.`))
      await forget([...new Set([...tracked, ...(count === null ? [key] : spread(key, count))])])
    },

    async clearAll() {
      await forget([...known])
    },
  }
}
