import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '@/proxy'
import { CONTENT_SEGMENTS, safetyPath } from '@/shared/content-paths'
import { allEntries, entryBySlug, entryForToxin, safetyIndex, visibleEntries } from '@/features/safety/load'
import SafetyArticle, { safetyFaqJsonLd, safetyHeading } from '@/features/safety/SafetyArticle'
import SafetyHubSearch from '@/features/safety/SafetyHubSearch'
import { hubSearch } from '@/features/safety/hub-search'
import EntryPage, { generateMetadata, generateStaticParams } from '@/app/(content)/mozhno-li/[slug]/page'
import Hub from '@/app/(content)/mozhno-li/page'
import ToxinArticle from '@/app/(content)/otravlenie/[slug]/page'

/**
 * The public «Можно ли» pages (SAFE-05): one page per reference entry and a
 * hub that searches in the browser. Production shows published entries only;
 * all twelve pilot entries are drafts today, so most cases here run as a
 * Vercel preview, where drafts are shown, marked and `noindex`.
 */

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })
const html = (element: ReactElement) => renderToStaticMarkup(element)

function matched(path: string): boolean {
  return config.matcher.some(pattern => new RegExp(`^${pattern}$`).test(path))
}

afterEach(() => vi.unstubAllEnvs())

describe('the entry pages on a preview', () => {
  beforeEach(() => vi.stubEnv('VERCEL_ENV', 'preview'))

  it('are prerendered for exactly the visible entries', () => {
    expect(generateStaticParams()).toEqual(visibleEntries().map(entry => ({ slug: entry.slug })))
    expect(generateStaticParams().length).toBeGreaterThan(0)
  })

  it('have a short title, the summary as description, a canonical and noindex for a draft', async () => {
    const entry = entryBySlug('shokolad')!
    const meta = await generateMetadata(params('shokolad'))
    expect(typeof meta.title).toBe('string')
    expect((meta.title as string).length).toBeLessThanOrEqual(60)
    expect([entry.bySpecies.dog.summary.ru, entry.bySpecies.cat.summary.ru]).toContain(meta.description)
    expect(meta.description!.length).toBeLessThanOrEqual(160)
    expect(meta.alternates?.canonical).toBe('/mozhno-li/shokolad')
    expect(entry.review.status).toBe('draft')
    expect(meta.robots).toMatchObject({ index: false })
  })

  it('keep every title within 60 characters and every description within 160', async () => {
    for (const entry of visibleEntries()) {
      const meta = await generateMetadata(params(entry.slug))
      expect((meta.title as string).length, entry.slug).toBeLessThanOrEqual(60)
      expect(meta.description!.length, entry.slug).toBeLessThanOrEqual(160)
    }
  })

  it('ask the question in the accusative, or fall back to the name', () => {
    const entry = entryBySlug('shokolad')!
    expect(safetyHeading(entry)).toBe('Можно ли кошкам и собакам шоколад?')
    expect(safetyHeading({ ...entry, titleRu: undefined })).toBe('Шоколад: можно ли кошкам и собакам')
  })

  it('give a FAQPage with the cat and the dog question, answered by the summaries', () => {
    const entry = entryBySlug('shokolad')!
    const faq = safetyFaqJsonLd(entry)
    expect(faq['@type']).toBe('FAQPage')
    expect(faq.mainEntity.map(q => q.name)).toEqual(['Можно ли кошке шоколад?', 'Можно ли собаке шоколад?'])
    expect(faq.mainEntity.map(q => q.acceptedAnswer.text)).toEqual([entry.bySpecies.cat.summary.ru, entry.bySpecies.dog.summary.ru])
  })

  it('show the heading, both species with their verdicts, what to do, sources, the draft mark and the JSON-LD', () => {
    const page = html(createElement(SafetyArticle, { entry: entryBySlug('shokolad')! }))
    expect(page).toContain('<h1>Можно ли кошкам и собакам шоколад?</h1>')
    expect(page).toMatch(/Кошкам[\s\S]*Нельзя[\s\S]*Собакам[\s\S]*Нельзя/)
    for (const title of ['Почему', 'Признаки', 'Если питомец уже съел', 'Что сделать сразу', 'Чего не делать', 'Источники']) {
      expect(page, title).toContain(title)
    }
    expect(page).toContain('href="/otravlenie/shokolad"')
    expect(page).toContain('href="/o-materialah"')
    expect(page).toContain('Черновик')
    expect(page).toContain('application/ld+json')
    expect(page).toContain('"FAQPage"')
    // The way into the app is the existing call to action.
    expect(page).toContain('href="/register?next=/pets/new"')
  })

  it('caption the verdict by category, the way the app does', () => {
    const plant = html(createElement(SafetyArticle, { entry: entryBySlug('hlorofitum')! }))
    expect(plant).toContain('Безопасно')
    const medicine = html(createElement(SafetyArticle, { entry: entryBySlug('ibuprofen')! }))
    expect(medicine).toContain('Опасно')
    expect(medicine).toContain('Лекарства для людей не давайте питомцу без назначения врача')
    const household = html(createElement(SafetyArticle, { entry: entryBySlug('antifriz')! }))
    expect(household).toContain('Опасно')
  })

  it('never claim a vet checked them', () => {
    for (const entry of visibleEntries()) {
      expect(html(createElement(SafetyArticle, { entry })), entry.slug).not.toMatch(/провер\S* ветеринар|ветеринар\S* провер/i)
    }
  })

  it('and the poisoning pages link to each other', async () => {
    const entry = entryForToxin('shokolad')!
    expect(entry.slug).toBe('shokolad')
    expect(html(await ToxinArticle(params('shokolad')))).toContain(`href="${safetyPath('shokolad')}"`)
    // No entry for a poisoning without one.
    expect(entryForToxin('nothing-like-this')).toBeUndefined()
  })
})

describe('the entry pages in production', () => {
  it('are not built for a draft, and a draft is a 404', async () => {
    const drafts = allEntries().filter(entry => entry.review.status !== 'published')
    expect(generateStaticParams()).toEqual(visibleEntries().map(entry => ({ slug: entry.slug })))
    for (const entry of drafts) {
      expect(generateStaticParams()).not.toContainEqual({ slug: entry.slug })
    }
    if (drafts.length > 0) {
      await expect(EntryPage(params(drafts[0].slug))).rejects.toMatchObject({ digest: expect.stringContaining('404') })
      expect(await generateMetadata(params(drafts[0].slug))).toEqual({})
    }
  })

  it('leave the hub a page with something to say when nothing is published', () => {
    if (visibleEntries().length > 0) return
    const page = html(Hub())
    expect(page).toContain('<h1>')
    expect(page).toContain('Справочник скоро появится')
    expect(page).toContain('href="/register?next=/pets/new"')
  })
})

describe('the hub', () => {
  beforeEach(() => vi.stubEnv('VERCEL_ENV', 'preview'))

  it('lists every visible entry as a link, by category, before any script runs', () => {
    const page = html(Hub())
    for (const entry of visibleEntries()) expect(page, entry.slug).toContain(`href="/mozhno-li/${entry.slug}"`)
    for (const title of ['Продукты', 'Растения', 'Лекарства', 'Быт']) expect(page, title).toContain(title)
  })

  it('draws no search field without JavaScript: the field would do nothing', () => {
    expect(html(createElement(SafetyHubSearch, { index: safetyIndex('ru') }))).not.toContain('<input')
  })

  it('finds an entry by name, by alias and with a typo, and says when it has nothing', () => {
    const index = safetyIndex('ru')
    for (const query of ['шоколад', 'какао', 'шокалад']) {
      const result = hubSearch(index, query)
      expect(result.state, query).toBe('found')
      if (result.state === 'found') expect(result.items[0].slug, query).toBe('shokolad')
    }
    expect(hubSearch(index, 'кирпич').state).toBe('missing')
    expect(hubSearch(index, '  ').state).toBe('idle')
  })
})

describe('the content segment', () => {
  it('is a content segment the proxy leaves alone, and only it', () => {
    expect(CONTENT_SEGMENTS).toContain('mozhno-li')
    expect(matched('/mozhno-li')).toBe(false)
    expect(matched('/mozhno-li/shokolad')).toBe(false)
    expect(matched('/mozhno-li-drugoe')).toBe(true)
    expect(safetyPath('shokolad')).toBe('/mozhno-li/shokolad')
  })
})
