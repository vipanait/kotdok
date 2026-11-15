import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SAFETY_ICON_NAMES, vocab } from '@lapka/shared'
import SafetyIcon, { SAFETY_ICON_SIZE, safetyIconSrc } from '@/features/safety/SafetyIcon'
import SafetyFootnote from '@/features/safety/SafetyFootnote'
import AboutArticles from '@/app/(content)/o-materialah/page'
import { nonePublished, onlyPublished, withReviewStatus } from './review-states'

/**
 * The pet-safety design pass, step D1 (docs/design/pet-safety-v1/implementation-handoff.md
 * §5 and §8): the item pictures the pages will draw, and the short footnote
 * that hands the long explanation to «О материалах».
 */

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url))

describe('the item pictures', () => {
  it('ship with the site, one file for every name, not read out of docs/', () => {
    for (const name of SAFETY_ICON_NAMES) {
      const src = safetyIconSrc(name)
      expect(src).toBe(`/images/safety/${name}.svg`)
      const file = `${publicDir}${src}`
      expect(existsSync(file), file).toBe(true)
      expect(readFileSync(file, 'utf8')).toMatch(/^<svg [^>]*viewBox="0 0 52 52"/)
    }
  })

  it('are decorative: hidden from a screen reader, with an empty alt, at the design sizes', () => {
    expect(SAFETY_ICON_SIZE).toEqual({ card: 48, chip: 24 })
    const card = renderToStaticMarkup(createElement(SafetyIcon, { name: 'chocolate' }))
    expect(card).toContain('src="/images/safety/chocolate.svg"')
    expect(card).toContain('alt=""')
    expect(card).toContain('aria-hidden="true"')
    expect(card).toContain('width="48"')
    expect(card).toContain('height="48"')
    const chip = renderToStaticMarkup(createElement(SafetyIcon, { name: 'plant', size: 'chip' }))
    expect(chip).toContain('width="24"')
  })
})

describe('the short footnote', () => {
  it('says the one sentence and links «О материалах» to the section that explains it once an entry is published', () =>
    withReviewStatus(onlyPublished('shokolad'), () => {
      const page = renderToStaticMarkup(createElement(SafetyFootnote))
      expect(page).toContain('Справочная информация. Не заменяет консультацию ветеринара.')
      expect(page).toMatch(/<a [^>]*href="\/o-materialah#mozhno-li"[^>]*>О материалах<\/a>/)
      expect(page).not.toContain('Ветеринарный врач их не проверял')
    }))

  it('links the page itself while nothing is published: the section is not rendered, so no dead anchor', () =>
    withReviewStatus(nonePublished('agent_reviewed'), () => {
      const page = renderToStaticMarkup(createElement(SafetyFootnote))
      expect(page).toMatch(/<a [^>]*href="\/o-materialah"[^>]*>О материалах<\/a>/)
      expect(page).not.toContain('#mozhno-li')
      expect(renderToStaticMarkup(AboutArticles())).not.toContain('id="mozhno-li"')
    }))
})

describe('«О материалах»', () => {
  it('says the full explanation of the reference word for word once an entry is published', () =>
    withReviewStatus(onlyPublished('shokolad'), () => {
      const page = renderToStaticMarkup(AboutArticles())
      expect(page).toContain('id="mozhno-li"')
      for (const paragraph of vocab.ru.safetyAbout.paragraphs) expect(page).toContain(paragraph)
      // The rest of the page is still there.
      for (const title of ['Что это за страницы', 'Как появляется текст', 'Пять уровней срочности', 'Если сомневаетесь']) {
        expect(page).toContain(title)
      }
    }))

  it('still leaves the reference out while nothing is published', () =>
    withReviewStatus(nonePublished('draft'), () => {
      const page = renderToStaticMarkup(AboutArticles())
      expect(page).not.toContain('id="mozhno-li"')
      expect(page).not.toContain(vocab.ru.safetyAbout.paragraphs[0])
    }))
})
