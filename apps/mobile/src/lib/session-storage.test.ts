import { describe, expect, it, vi } from 'vitest'
import {
  SECURE_STORE_VALUE_LIMIT,
  SessionWriteError,
  createSessionStorage,
  type SecureStorage,
} from './session-storage'

function workingStore(): SecureStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      values.delete(key)
    }),
  }
}

describe('session storage', () => {
  it('round-trips a session', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })

    await storage.setItem('session', 'token')

    await expect(storage.getItem('session')).resolves.toBe('token')
  })

  it('treats an unreadable store as no session rather than crashing', async () => {
    const store = workingStore()
    store.getItemAsync = vi.fn(async () => {
      throw new Error('keychain unavailable')
    })
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })

    await expect(storage.getItem('session')).resolves.toBeNull()
  })

  it('reports a failed write instead of pretending it worked', async () => {
    const store = workingStore()
    store.setItemAsync = vi.fn(async () => {
      throw new Error('keychain locked')
    })
    const onWriteFailure = vi.fn()
    const storage = createSessionStorage({ storage: store, onWriteFailure })

    await storage.setItem('session', 'token')

    expect(onWriteFailure).toHaveBeenCalledTimes(1)
    expect(onWriteFailure.mock.calls[0][0]).toBeInstanceOf(SessionWriteError)
    // Nothing was stored, so the app must not believe it is signed in.
    await expect(storage.getItem('session')).resolves.toBeNull()
  })

  it('refuses a value past the platform limit before the store does', async () => {
    const store = workingStore()
    const onWriteFailure = vi.fn()
    const storage = createSessionStorage({ storage: store, onWriteFailure })

    await storage.setItem('session', 'x'.repeat(SECURE_STORE_VALUE_LIMIT + 1))

    expect(onWriteFailure).toHaveBeenCalledTimes(1)
    expect(store.setItemAsync).not.toHaveBeenCalled()
  })

  it('accepts a value exactly at the limit', async () => {
    const store = workingStore()
    const onWriteFailure = vi.fn()
    const storage = createSessionStorage({ storage: store, onWriteFailure })

    await storage.setItem('session', 'x'.repeat(SECURE_STORE_VALUE_LIMIT))

    expect(onWriteFailure).not.toHaveBeenCalled()
    expect(store.values.size).toBe(1)
  })

  it('leaves nothing behind when the user signs out', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })

    await storage.setItem('session', 'token')
    await storage.setItem('code-verifier', 'verifier')

    await storage.clearAll()

    expect(store.values.size).toBe(0)
    await expect(storage.getItem('session')).resolves.toBeNull()
    await expect(storage.getItem('code-verifier')).resolves.toBeNull()
  })

  it('finishes signing out even if the store throws on delete', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    await storage.setItem('session', 'token')
    store.deleteItemAsync = vi.fn(async () => {
      throw new Error('keychain locked')
    })

    await expect(storage.clearAll()).resolves.toBeUndefined()
  })
})
