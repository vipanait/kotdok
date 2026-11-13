import { describe, expect, it } from 'vitest'
import { RECENT_KEY, RECENT_MAX, addRecent, parseRecent, serialiseRecent } from './recent'

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
