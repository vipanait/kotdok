import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entryBySlug, visibleEntries } from '@/features/safety/load'
import SafetyArticle from '@/features/safety/SafetyArticle'
import type { SafetyEntry } from '@/features/safety/schema'
import Hub from '@/app/(content)/mozhno-li/page'
import { HUB_SEARCH_TITLE, hubSearching } from '@/features/safety/hub-search'
import { SafetyNoMatch } from '@/features/safety/SafetyHubSearch'
import { nonePublished, withReviewStatus } from './review-states'

/**
 * The pet-safety design pass, step D2 (docs/design/pet-safety-v1/implementation-handoff.md
 * §6): what the new layout must not lose. The advice after eating comes
 * before the explanation; when it differs by species each block says whom it
 * is for; `none` draws nothing; the whole catalogue stays links in the HTML.
 *
 * The «if eaten» cases are built on `shokolad` with the values overridden, so
 * they do not depend on what a content file says on the day.
 */

const html = (entry: SafetyEntry) => renderToStaticMarkup(createElement(SafetyArticle, { entry }))
type IfEaten = SafetyEntry['bySpecies']['cat']['ifEaten']

function withIfEaten(cat: IfEaten, dog: IfEaten): SafetyEntry {
  const entry = entryBySlug('shokolad')!
  return {
    ...entry,
    bySpecies: { cat: { ...entry.bySpecies.cat, ifEaten: cat }, dog: { ...entry.bySpecies.dog, ifEaten: dog } },
  }
}

/** The «Если питомец уже съел» section's markup, or '' when there is none. */
function eatenSection(page: string): string {
  const at = page.indexOf('aria-labelledby="eaten-title"')
  if (at === -1) return ''
  return page.slice(at, page.indexOf('</section>', at))
}

beforeEach(() => vi.stubEnv('VERCEL_ENV', 'preview'))
afterEach(() => vi.unstubAllEnvs())

describe('the entry page', () => {
  it('puts the verdicts, then what to do if eaten, before why and the signs', () => {
    const page = html(withIfEaten('call_now', 'call_now'))
    const verdicts = page.indexOf('safety-verdicts')
    const eaten = page.indexOf('Если питомец уже съел')
    expect(verdicts).toBeGreaterThan(page.indexOf('<h1>'))
    expect(eaten).toBeGreaterThan(verdicts)
    expect(page.indexOf('>Почему<')).toBeGreaterThan(eaten)
    expect(page.indexOf('Признаки у')).toBeGreaterThan(eaten)
    // The urgent block is marked as such.
    expect(page).toContain('safety-eaten call-now')
  })

  it('gives one lead for both species when the advice is the same', () => {
    const section = eatenSection(html(withIfEaten('watch', 'watch')))
    expect(section).toContain('Для кошек и собак')
    expect(section.match(/Наблюдайте/g)).toHaveLength(1)
    expect(section).not.toContain('call-now')
  })

  it('labels each species and never merges the advice when it differs', () => {
    const section = eatenSection(html(withIfEaten('call_now', 'watch')))
    expect(section).not.toContain('Для кошек и собак')
    expect(section).toMatch(/Для кошек[\s\S]*Сразу позвоните в клинику[\s\S]*Для собак[\s\S]*Наблюдайте/)
  })

  it('draws no block for a species with nothing to do, and no section when neither has', () => {
    const one = eatenSection(html(withIfEaten('watch', 'none')))
    expect(one).toContain('Для кошек')
    expect(one).not.toContain('Для собак')
    expect(one).not.toContain('Для кошек и собак')

    const page = html(withIfEaten('none', 'none'))
    expect(page).not.toContain('Если питомец уже съел')
    expect(page).not.toContain('Что сделать сразу')
    // The way to the poisoning page stays.
    expect(page).toContain('href="/otravlenie/shokolad"')
  })

  it('keeps the medicine line and the draft mark next to the short footnote', () =>
    withReviewStatus(nonePublished('draft'), () => {
      const page = html(entryBySlug('ibuprofen')!)
      expect(page).toContain('Лекарства для людей не давайте питомцу без назначения врача')
      // Entries are reviewed by the agent before publishing: the mark says unpublished, not unchecked.
      expect(page).toContain('Черновик: страница ещё не опубликована.')
      expect(page).not.toContain('не опубликована и не проверена')
      expect(page).toContain('Справочная информация. Не заменяет консультацию ветеринара.')
    }))
})

describe('the hub', () => {
  it('server-renders every visible entry as a link with its picture, by category, and the popular six', () => {
    const page = renderToStaticMarkup(Hub())
    for (const entry of visibleEntries()) expect(page, entry.slug).toContain(`href="/mozhno-li/${entry.slug}"`)
    expect(page).toContain('Часто спрашивают')
    expect(page).toContain('id="catalogue"')
    for (const category of ['food', 'plant', 'medicine', 'household']) expect(page, category).toContain(`id="safety-${category}"`)
    expect(page).toContain('src="/images/safety/chocolate.svg"')
    // A store link for each platform.
    expect(page).toContain('href="https://apps.apple.com/')
    expect(page).toContain('href="https://play.google.com/')
    expect(page).toContain('Справочная информация. Не заменяет консультацию ветеринара.')
  })

  it('is the empty state, with the way to the poisoning help and no catalogue, when nothing is visible', () => {
    vi.unstubAllEnvs()
    return withReviewStatus(nonePublished(), () => {
      const page = renderToStaticMarkup(Hub())
      expect(page).toContain('Справочник скоро появится')
      expect(page).toContain('href="/otravlenie"')
      expect(page).not.toContain('id="catalogue"')
      expect(page).not.toContain('Часто спрашивают')
    })
  })
})

describe('quiet search and service states (handoff, «Уточнение: поиск, пустые результаты и ошибки»)', () => {
  it('searches only for something that can be searched for: a chip or spaces are not a query', () => {
    expect(HUB_SEARCH_TITLE).toBe('Поиск по справочнику')
    expect(hubSearching('шок')).toBe(true)
    expect(hubSearching('')).toBe(false)
    expect(hubSearching('  ? ')).toBe(false)
  })

  it('sends the full heading, lead and picture in the server HTML: nothing is typed before the script runs', () => {
    const page = renderToStaticMarkup(Hub())
    expect(page).toContain('<h1>Можно ли это кошке или собаке</h1>')
    expect(page).toContain('safety-hero-art')
    expect(page).not.toContain(HUB_SEARCH_TITLE + '</h1>')
    expect(page.match(/<h1>/g)).toHaveLength(1)
  })

  it('draws the empty reference as a plain card: no picture on a tile', () => {
    vi.unstubAllEnvs()
    return withReviewStatus(nonePublished(), () => {
      const page = renderToStaticMarkup(Hub())
      expect(page).toMatch(/<section class="safety-state"[^>]*><h2 id="empty-title">Справочник скоро появится<\/h2>/)
      expect(page).not.toContain('safety-missing-icon')
    })
  })

  it('offers the app for what is not in the reference — both stores, no AI on the site', () => {
    const card = renderToStaticMarkup(createElement(SafetyNoMatch, { inCategory: false }))
    expect(card).toContain('<h3>Ничего не нашли</h3>')
    expect(card).toContain('Спросить в приложении')
    expect(card).toContain('href="https://apps.apple.com/')
    expect(card).toContain('href="https://play.google.com/')
    expect(card).not.toContain('<form')
    expect(card).not.toContain('Искать во всех категориях')
    expect(renderToStaticMarkup(createElement(SafetyNoMatch, { inCategory: true }))).toContain('Искать во всех категориях')
  })
})
