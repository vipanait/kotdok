import { describe, expect, it } from 'vitest'
import { createOnboardingStore, readOnboarding } from './onboarding-store'

function memory() {
  const values = new Map<string, string>()
  return {
    values,
    storage: {
      getItemAsync: async (name: string) => values.get(name) ?? null,
      setItemAsync: async (name: string, value: string) => void values.set(name, value),
      deleteItemAsync: async (name: string) => void values.delete(name),
    },
  }
}

describe('the first entry’s choice (onboarding)', () => {
  it('reads a first entry from nothing, damage or a later build’s values', () => {
    expect(readOnboarding(null)).toEqual({ skipped: false, goal: null })
    expect(readOnboarding('{oops')).toEqual({ skipped: false, goal: null })
    expect(readOnboarding('{"skipped":"yes","goal":"tour"}')).toEqual({ skipped: false, goal: null })
  })

  it('remembers «Пока просто посмотрю» and a path begun, per account', async () => {
    const { storage } = memory()
    const store = createOnboardingStore(storage as never)
    await store.choose('user-a', 'health')
    expect(await store.read('user-a')).toEqual({ skipped: false, goal: 'health' })
    expect(await store.read('user-b')).toEqual({ skipped: false, goal: null })
    await store.finish('user-a')
    expect((await store.read('user-a')).goal).toBeNull()
    await store.skip('user-b')
    expect(await store.read('user-b')).toEqual({ skipped: true, goal: null })
    await store.forget('user-b')
    expect(await store.read('user-b')).toEqual({ skipped: false, goal: null })
  })
})
