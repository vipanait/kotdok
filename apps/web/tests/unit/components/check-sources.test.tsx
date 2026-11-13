import { describe, expect, it } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import CheckSources from '@/features/symptom-check/CheckSources'
import { render, tags } from './static-render'

// SRC-01: the result page names the materials the analysis relied on.

const VCA = {
  title: 'Vomiting in Cats',
  publisher: 'VCA Animal Hospitals',
  url: 'https://vcahospitals.com/know-your-pet/vomiting-in-cats',
  lang: 'en',
}
const MERCK = {
  title: 'Disorders of the Stomach in Cats',
  publisher: 'Merck Veterinary Manual',
  url: 'https://www.merckvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats',
  lang: 'en',
}

describe('the sources of a result on the site', () => {
  it('links every source to its original, in a new tab', () => {
    const html = render(<CheckSources fullResponse={{ sources: [VCA, MERCK] }} dict={ru} locale="ru" />)

    const links = tags(html, 'a')
    expect(links.map((link) => [link.attrs.href, link.text])).toEqual([
      [VCA.url, VCA.title],
      [MERCK.url, MERCK.title],
    ])
    for (const link of links) {
      expect(link.attrs.target).toBe('_blank')
      expect(link.attrs.rel).toBe('noopener noreferrer')
      // The title is the publisher's own, in its language.
      expect(link.attrs.lang).toBe('en')
    }
    expect(tags(html, 'h3').map((h) => h.text)).toEqual([ru.check.sourcesTitle])
    expect(html).toContain(ru.check.sourcesNote)
    expect(html).toContain('VCA Animal Hospitals')
  })

  it('says an English article is in English on a Russian page, and not on an English one', () => {
    const onRussian = render(<CheckSources fullResponse={{ sources: [VCA] }} dict={ru} locale="ru" />)
    expect(onRussian).toContain(`VCA Animal Hospitals · ${ru.check.sourceInEnglish}`)

    const onEnglish = render(<CheckSources fullResponse={{ sources: [VCA] }} dict={en} locale="en" />, 'en')
    expect(onEnglish).toContain('VCA Animal Hospitals')
    expect(onEnglish).not.toContain(en.check.sourceInEnglish)
    expect(tags(onEnglish, 'h3').map((h) => h.text)).toEqual([en.check.sourcesTitle])
  })

  it('draws nothing for a check without sources', () => {
    expect(render(<CheckSources fullResponse={null} dict={ru} locale="ru" />)).toBe('')
    expect(render(<CheckSources fullResponse={{ urgency: 'monitor' }} dict={ru} locale="ru" />)).toBe('')
    expect(render(<CheckSources fullResponse={{ sources: [] }} dict={ru} locale="ru" />)).toBe('')
    expect(render(<CheckSources fullResponse={{ sources: [{ ...VCA, url: 'javascript:alert(1)' }] }} dict={ru} locale="ru" />)).toBe('')
  })
})
