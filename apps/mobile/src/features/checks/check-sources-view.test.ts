import { describe, expect, it } from 'vitest'
import type { CheckSource } from '@lapka/contracts'
import { dictionary } from '@/i18n'
import { sourceLines } from './check-sources-view'

const vca: CheckSource = {
  title: 'Vomiting in Cats',
  publisher: 'VCA Animal Hospitals',
  url: 'https://vcahospitals.com/know-your-pet/vomiting-in-cats',
  lang: 'en',
}

describe('the sources of a result, as lines to read', () => {
  it('says an English article is in English under a Russian result', () => {
    expect(sourceLines(dictionary('ru'), [vca], 'ru')).toEqual([
      { title: 'Vomiting in Cats', caption: 'VCA Animal Hospitals · на английском', url: vca.url },
    ])
  })

  it('does not say so under an English result', () => {
    expect(sourceLines(dictionary('en'), [vca], 'en')[0].caption).toBe('VCA Animal Hospitals')
  })

  it('has no lines without sources', () => {
    expect(sourceLines(dictionary('ru'), [], 'ru')).toEqual([])
  })
})
