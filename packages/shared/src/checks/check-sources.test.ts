import { describe, expect, it } from 'vitest'
import { checkSources } from './check-sources'

const vca = {
  title: 'Vomiting in Cats',
  publisher: 'VCA Animal Hospitals',
  url: 'https://vcahospitals.com/know-your-pet/vomiting-in-cats',
  lang: 'en',
}

describe('the sources of a stored check', () => {
  it('reads nothing from a check that has none', () => {
    expect(checkSources(null)).toEqual([])
    expect(checkSources({})).toEqual([])
    expect(checkSources({ sources: 'x' })).toEqual([])
    expect(checkSources({ sources: {} })).toEqual([])
    expect(checkSources({ sources: [] })).toEqual([])
  })

  it('returns a source as it was stored', () => {
    expect(checkSources({ sources: [vca] })).toEqual([vca])
  })

  it('reads a source that carries a field this build does not know', () => {
    expect(checkSources({ sources: [{ ...vca, published_at: '2026-01-01' }] })).toHaveLength(1)
  })

  it('leaves out what it cannot show and keeps the rest', () => {
    const sources = checkSources({
      sources: [
        { ...vca, title: '' },
        { ...vca, title: undefined },
        { ...vca, url: 'http://vcahospitals.com/a' },
        { ...vca, url: 'javascript:alert(1)' },
        { ...vca, url: 'not a link' },
        { ...vca, lang: 'de' },
        'a string',
        null,
        vca,
      ],
    })

    expect(sources).toEqual([vca])
  })

  it('shows three at most', () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ ...vca, title: `Article ${n}` }))

    expect(checkSources({ sources: five }).map((source) => source.title)).toEqual([
      'Article 1',
      'Article 2',
      'Article 3',
    ])
  })
})
