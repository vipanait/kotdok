import { describe, expect, it } from 'vitest'
import { RECENT_KEY, RECENT_MAX, addRecent, createRecentStore, parseRecent, serialiseRecent } from './recent'

const ME = 'user-1'

describe('recent safety queries', () => {
  it('lifts a query asked again instead of listing it twice', () => {
    // Compared after normalisation: case, spaces and «ё» do not make a new query.
    expect(addRecent(['шоколад'], 'Шоколад ')).toEqual(['Шоколад'])
    expect(addRecent(['авокадо', 'шоколад'], 'шоколад')).toEqual(['шоколад', 'авокадо'])
  })

  it('keeps at most ten, newest first', () => {
    const full = Array.from({ length: RECENT_MAX }, (_, i) => `q${i}`)
    const next = addRecent(full, 'новый')

    expect(next).toHaveLength(10)
    expect(next[0]).toBe('новый')
    expect(next).not.toContain('q9')
  })

  it('ignores a query that normalises to nothing', () => {
    expect(addRecent(['шоколад'], ' ?! ')).toEqual(['шоколад'])
  })

  it('belongs to one account', () => {
    const raw = serialiseRecent(ME, ['шоколад', 'авокадо'])

    expect(parseRecent(raw, ME)).toEqual(['шоколад', 'авокадо'])
    expect(parseRecent(raw, 'user-2')).toEqual([])
  })

  it('survives rubbish instead of crashing on it', () => {
    for (const raw of [null, '', 'not json', '[]', '{}', '{"userId":"user-1","queries":"x"}']) {
      expect(parseRecent(raw, ME), String(raw)).toEqual([])
    }
    expect(parseRecent(JSON.stringify({ userId: ME, queries: ['a', 3, null, 'b'] }), ME)).toEqual(['a', 'b'])
  })

  it('has its own storage key', () => {
    expect(RECENT_KEY).toBe('lapka.safety-recent')
  })
})

describe('the recent queries every screen shares', () => {
  function memory(initial: Record<string, string> = {}) {
    const values = { ...initial }
    return {
      values,
      getItem: async (key: string) => values[key] ?? null,
      setItem: async (key: string, value: string) => {
        values[key] = value
      },
    }
  }

  it('shows a query remembered on one screen to another, and keeps it on the next remember', async () => {
    const storage = memory()
    const store = createRecentStore(storage)
    // The search screen and the AI screen are two consumers of one store.
    await store.load(ME)
    await store.remember(ME, 'драконий фрукт')
    expect(store.get(ME)).toEqual(['драконий фрукт'])

    await store.remember(ME, 'шоколад')
    expect(store.get(ME)).toEqual(['шоколад', 'драконий фрукт'])
    expect(parseRecent(storage.values[RECENT_KEY] ?? null, ME)).toEqual(['шоколад', 'драконий фрукт'])
  })

  it('starts from what is stored, and a remember before the read finishes is not lost', async () => {
    const storage = memory({ [RECENT_KEY]: serialiseRecent(ME, ['авокадо']) })
    const store = createRecentStore(storage)
    await store.remember(ME, 'шоколад')
    expect(store.get(ME)).toEqual(['шоколад', 'авокадо'])
  })

  it('tells its listeners, and shows nothing of another account', async () => {
    const store = createRecentStore(memory({ [RECENT_KEY]: serialiseRecent('user-2', ['чужое']) }))
    let calls = 0
    const stop = store.subscribe(() => calls++)
    await store.remember(ME, 'шоколад')
    stop()
    expect(calls).toBeGreaterThan(0)
    expect(store.get(ME)).toEqual(['шоколад'])
    expect(store.get('user-2')).toEqual([])
  })
})
