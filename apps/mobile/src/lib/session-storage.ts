/**
 * Where the Supabase session lives on the phone.
 *
 * Two things make this more than a thin wrapper around the keychain:
 *
 * 1. A write can fail. The keychain can be unavailable, and Android's
 *    SecureStore refuses values past 2048 bytes — a session with a large token
 *    can cross that. If a write fails silently the app ends up believing it is
 *    signed in while nothing was persisted, and the next cold start drops the
 *    user with no explanation. So a failed write is reported, and the caller
 *    signs out on purpose instead of drifting into that state.
 *
 * 2. Signing out has to leave nothing behind. The next person to use the phone
 *    must not see the previous account's data.
 */

/** The slice of expo-secure-store this needs, so tests need no native module. */
export type SecureStorage = {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

/** Android's SecureStore rejects values longer than this. */
export const SECURE_STORE_VALUE_LIMIT = 2048

export class SessionWriteError extends Error {
  constructor(readonly key: string, readonly cause: unknown) {
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
  /** Everything this module has written, for a clean sign-out. */
  clearAll(): Promise<void>
}

export function createSessionStorage(options: SessionStorageOptions): SessionStorage {
  const written = new Set<string>()

  return {
    async getItem(key) {
      try {
        return await options.storage.getItemAsync(key)
      } catch {
        // An unreadable store means no session, not a crash on launch.
        return null
      }
    },

    async setItem(key, value) {
      if (value.length > SECURE_STORE_VALUE_LIMIT) {
        options.onWriteFailure(
          new SessionWriteError(key, new Error(`value is ${value.length} bytes`)),
        )
        return
      }

      try {
        await options.storage.setItemAsync(key, value)
        written.add(key)
      } catch (error) {
        options.onWriteFailure(new SessionWriteError(key, error))
      }
    },

    async removeItem(key) {
      written.delete(key)
      try {
        await options.storage.deleteItemAsync(key)
      } catch {
        // Nothing to do: the value is going away either way.
      }
    },

    async clearAll() {
      const keys = [...written]
      written.clear()
      await Promise.all(keys.map((key) => options.storage.deleteItemAsync(key).catch(() => {})))
    },
  }
}
