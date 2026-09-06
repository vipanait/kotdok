import { describe, expect, it, vi } from 'vitest'
import {
  CHUNK_BYTES,
  MAX_CHUNKS,
  SECURE_STORE_VALUE_LIMIT,
  SessionWriteError,
  createSessionStorage,
  utf8ByteLength,
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

/**
 * A session the size Supabase actually issues. Measured against the staging
 * project: 2291 bytes, of which the user object was 1158. The old code refused
 * anything past 2048, so no one could stay signed in — this is the case that
 * has to keep working.
 */
function realisticSession(): string {
  const session = {
    access_token: `header.${'p'.repeat(900)}.signature`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1788699999,
    refresh_token: 'w6ymqhbrbtj7',
    user: {
      id: '2f3d6ae3-d78f-473e-b077-4c43b8508dcd',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'verify-stage-1788695513@lapka-staging.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { notes: 'x'.repeat(700) },
      created_at: '2026-09-06T11:51:53.000Z',
      updated_at: '2026-09-06T11:51:53.000Z',
    },
  }
  return JSON.stringify(session)
}

describe('session storage', () => {
  it('round-trips a session', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })

    await storage.setItem('session', 'token')

    await expect(storage.getItem('session')).resolves.toBe('token')
  })

  it('round-trips a session larger than one key can hold', async () => {
    const store = workingStore()
    const onWriteFailure = vi.fn()
    const storage = createSessionStorage({ storage: store, onWriteFailure })
    const session = realisticSession()
    expect(session.length).toBeGreaterThan(SECURE_STORE_VALUE_LIMIT)

    await storage.setItem('session', session)

    expect(onWriteFailure).not.toHaveBeenCalled()
    await expect(storage.getItem('session')).resolves.toBe(session)
  })

  it('keeps every stored value within what the platform accepts', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })

    await storage.setItem('session', 'x'.repeat(CHUNK_BYTES * 3 + 17))

    for (const value of store.values.values()) {
      expect(utf8ByteLength(value)).toBeLessThanOrEqual(SECURE_STORE_VALUE_LIMIT)
    }
  })

  it('measures chunks in bytes, not characters', async () => {
    // 2048 Cyrillic characters are 4096 bytes. Splitting on String.length
    // would produce chunks that pass a character check and still overrun the
    // limit this module exists to respect — on Android, where it is real.
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    const cyrillic = 'я'.repeat(CHUNK_BYTES)
    expect(cyrillic.length).toBeLessThan(utf8ByteLength(cyrillic))

    await storage.setItem('session', cyrillic)

    for (const [key, value] of store.values) {
      if (key === 'session') continue
      expect(utf8ByteLength(value)).toBeLessThanOrEqual(CHUNK_BYTES)
    }
    await expect(storage.getItem('session')).resolves.toBe(cyrillic)
  })

  it('never splits a character across two chunks', async () => {
    // An emoji is a surrogate pair and four bytes; a chunk that ended mid-pair
    // would come back as two replacement characters.
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    const value = '🐈'.repeat(CHUNK_BYTES)

    await storage.setItem('session', value)

    await expect(storage.getItem('session')).resolves.toBe(value)
  })

  it('leaves the previous session readable when a write fails', async () => {
    // A keychain that goes away mid-write must not take a working session with
    // it: the chunks it wrote go to the unused generation, and the header
    // still points at the old one.
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    await storage.setItem('session', 'first')

    let writes = 0
    store.setItemAsync = vi.fn(async (key: string, value: string) => {
      writes += 1
      if (writes === 1) throw new Error('keychain locked')
      store.values.set(key, value)
    })
    await storage.setItem('session', realisticSession())

    await expect(storage.getItem('session')).resolves.toBe('first')
  })

  it('survives a cold start: a value written by one instance reads back in the next', async () => {
    const store = workingStore()
    const session = realisticSession()
    await createSessionStorage({ storage: store, onWriteFailure: vi.fn() }).setItem(
      'session',
      session,
    )

    const next = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })

    await expect(next.getItem('session')).resolves.toBe(session)
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

  it('leaves no fragment behind when a write fails part way through', async () => {
    const store = workingStore()
    let writes = 0
    store.setItemAsync = vi.fn(async (key: string, value: string) => {
      writes += 1
      if (writes === 2) throw new Error('keychain locked')
      store.values.set(key, value)
    })
    const onWriteFailure = vi.fn()
    const storage = createSessionStorage({ storage: store, onWriteFailure })

    await storage.setItem('session', realisticSession())

    expect(onWriteFailure).toHaveBeenCalledTimes(1)
    expect(store.values.size).toBe(0)
    await expect(storage.getItem('session')).resolves.toBeNull()
  })

  it('refuses a value too large for any reasonable session', async () => {
    const store = workingStore()
    const onWriteFailure = vi.fn()
    const storage = createSessionStorage({ storage: store, onWriteFailure })

    await storage.setItem('session', 'x'.repeat(SECURE_STORE_VALUE_LIMIT * MAX_CHUNKS + 1))

    expect(onWriteFailure).toHaveBeenCalledTimes(1)
    expect(store.setItemAsync).not.toHaveBeenCalled()
  })

  it('does not leave the tail of a longer value behind when a shorter one replaces it', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    await storage.setItem('session', realisticSession())

    await storage.setItem('session', 'short')

    await expect(storage.getItem('session')).resolves.toBe('short')
    // The header plus exactly one chunk, and nothing from the previous write.
    expect(store.values.size).toBe(2)
  })

  it('reports no session when a chunk has gone missing', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    await storage.setItem('session', realisticSession())

    // Keys carry the generation: session.a.1, not session.1.
    const chunk = [...store.values.keys()].find((key) => key.startsWith('session.'))
    store.values.delete(chunk as string)

    await expect(storage.getItem('session')).resolves.toBeNull()
  })

  it('leaves nothing behind when the user signs out', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })

    await storage.setItem('session', realisticSession())
    await storage.setItem('code-verifier', 'verifier')

    await storage.clearAll()

    expect(store.values.size).toBe(0)
    await expect(storage.getItem('session')).resolves.toBeNull()
    await expect(storage.getItem('code-verifier')).resolves.toBeNull()
  })

  it('leaves nothing behind when signing out after a cold start', async () => {
    const store = workingStore()
    await createSessionStorage({ storage: store, onWriteFailure: vi.fn() }).setItem(
      'session',
      realisticSession(),
    )

    // A fresh instance has written nothing itself, but the previous run's
    // chunks are still in the keychain and must not survive a sign-out.
    const next = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    await next.getItem('session')
    await next.clearAll()

    expect(store.values.size).toBe(0)
  })

  it('removes every chunk of one value without touching another', async () => {
    const store = workingStore()
    const storage = createSessionStorage({ storage: store, onWriteFailure: vi.fn() })
    await storage.setItem('session', realisticSession())
    await storage.setItem('code-verifier', 'verifier')

    await storage.removeItem('session')

    await expect(storage.getItem('session')).resolves.toBeNull()
    await expect(storage.getItem('code-verifier')).resolves.toBe('verifier')
    expect([...store.values.keys()].some((key) => key.startsWith('session'))).toBe(false)
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
