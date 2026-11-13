import { describe, expect, it } from 'vitest'
import type { SafetyIndexItem } from '@lapka/contracts'
import { matchSafety, normalizeSafetyQuery, SAFETY_SUGGESTIONS_MAX } from './match'

const item = (slug: string, name: string, aliases: string[] = []): SafetyIndexItem => ({
  slug,
  category: 'food',
  name,
  aliases,
  verdict: { cat: 'danger', dog: 'danger' },
})

const index: SafetyIndexItem[] = [
  item('shokolad', 'Шоколад', ['какао', 'шоколадка']),
  item('vinograd', 'Виноград', ['изюм']),
  item('ris', 'Рис'),
]

const bigIndex: SafetyIndexItem[] = Array.from({ length: 30 }, (_, n) => item(`a-${n}`, `Арбуз ${n}`, [`ананас ${n}`]))

describe('normalizeSafetyQuery', () => {
  it('lowers the case, drops punctuation and repeated spaces', () => {
    expect(normalizeSafetyQuery('  ШОКОЛАД,  молочный!! ')).toBe('шоколад молочный')
  })

  it('reads «ё» as «е»', () => {
    expect(normalizeSafetyQuery('Ёлка')).toBe('елка')
  })

  it('cuts a query to 80 characters', () => {
    expect(normalizeSafetyQuery('а'.repeat(200))).toHaveLength(80)
  })
})

describe('matchSafety', () => {
  it('finds an entry by an alias', () => {
    expect(matchSafety(index, 'Изюм').exact?.slug).toBe('vinograd')
  })

  it('forgives one typo in a word of five letters or more', () => {
    expect(matchSafety(index, 'шокалад').exact?.slug).toBe('shokolad')
  })

  it('does not forgive a typo in a shorter word', () => {
    expect(matchSafety(index, 'рос').exact).toBeNull()
  })

  it('does not stretch a five-letter query onto a four-letter term', () => {
    // «риска» is one edit from «риск», but «риск» is too short to forgive a typo against.
    expect(matchSafety([item('risk', 'Риск')], 'риска').exact).toBeNull()
  })

  it('suggests entries whose word starts with the query', () => {
    expect(matchSafety(index, 'шок').suggestions.map(i => i.slug)).toEqual(['shokolad'])
  })

  it('returns nothing for an unknown or an empty query', () => {
    expect(matchSafety(index, 'драконий фрукт')).toEqual({ exact: null, exactKind: null, suggestions: [] })
    expect(matchSafety(index, '')).toEqual({ exact: null, exactKind: null, suggestions: [] })
    expect(matchSafety(index, '  !! ')).toEqual({ exact: null, exactKind: null, suggestions: [] })
  })

  it('suggests no more than eight entries', () => {
    expect(SAFETY_SUGGESTIONS_MAX).toBe(8)
    expect(matchSafety(bigIndex, 'а').suggestions).toHaveLength(8)
  })

  it('orders suggestions: exact, name start, alias start, anywhere; by name inside a group', () => {
    const list = [
      item('inside', 'Салат', ['несвежий салат']),
      item('alias-start', 'Яблоко', ['свежее яблоко']),
      item('name-start-b', 'Свежая рыба'),
      item('name-start-a', 'Свежая капуста'),
      item('exact', 'Сыр', ['свеж']),
    ]
    expect(matchSafety(list, 'свеж').suggestions.map(i => i.slug)).toEqual([
      'exact',
      'name-start-a',
      'name-start-b',
      'alias-start',
      'inside',
    ])
  })

  it('says how the exact entry was found: by name, by alias or by a typo', () => {
    expect(matchSafety(index, 'Шоколад').exactKind).toBe('name')
    expect(matchSafety(index, 'изюм').exactKind).toBe('alias')
    const typo = matchSafety(index, 'шокалад')
    expect(typo.exactKind).toBe('typo')
    // The typo still finds and suggests the entry: the phone and the hub keep their tolerance.
    expect(typo.exact?.slug).toBe('shokolad')
    expect(typo.suggestions[0]?.slug).toBe('shokolad')
    expect(matchSafety(index, 'рос').exactKind).toBeNull()
  })

  it('puts the exact entry first among suggestions', () => {
    const result = matchSafety(index, 'шоколадка')
    expect(result.exact?.slug).toBe('shokolad')
    expect(result.suggestions[0]?.slug).toBe('shokolad')
  })
})
