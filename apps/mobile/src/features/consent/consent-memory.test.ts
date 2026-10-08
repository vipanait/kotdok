import { describe, expect, it } from 'vitest'
import { createConsentMemory } from './consent-memory'

function fakeStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      values.set(key, value)
    },
    deleteItemAsync: async (key: string) => {
      values.delete(key)
    },
  }
}

describe('createConsentMemory', () => {
  it('knows nothing on a phone that never settled a consent', async () => {
    const memory = createConsentMemory(fakeStorage(), '2026-09')

    expect(await memory.knows('user-1')).toBe(false)
  })

  it('remembers the user whose consent the server confirmed', async () => {
    const memory = createConsentMemory(fakeStorage(), '2026-09')

    await memory.remember('user-1')

    expect(await memory.knows('user-1')).toBe(true)
  })

  it('does not vouch for another account on the same phone', async () => {
    const memory = createConsentMemory(fakeStorage(), '2026-09')

    await memory.remember('user-1')

    expect(await memory.knows('user-2')).toBe(false)
  })

  it('does not carry a consent over to a new edition of the text', async () => {
    const storage = fakeStorage()
    await createConsentMemory(storage, '2026-09').remember('user-1')

    expect(await createConsentMemory(storage, '2027-01').knows('user-1')).toBe(false)
  })

  it('forgets on sign-out', async () => {
    const memory = createConsentMemory(fakeStorage(), '2026-09')
    await memory.remember('user-1')

    await memory.forget()

    expect(await memory.knows('user-1')).toBe(false)
  })

  it('treats a storage that fails as knowing nothing', async () => {
    const memory = createConsentMemory(
      {
        getItemAsync: async () => {
          throw new Error('keychain locked')
        },
        setItemAsync: async () => {
          throw new Error('keychain locked')
        },
        deleteItemAsync: async () => {
          throw new Error('keychain locked')
        },
      },
      '2026-09',
    )

    await expect(memory.remember('user-1')).resolves.toBeUndefined()
    await expect(memory.forget()).resolves.toBeUndefined()
    expect(await memory.knows('user-1')).toBe(false)
  })
})
