import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '@/proxy'
import { CONTENT_SEGMENTS, safetyPath } from '@/shared/content-paths'
import { entryBySlug, entryForToxin, safetyIndex, visibleEntries } from '@/features/safety/load'
import SafetyArticle, { safetyFaqJsonLd, safetyHeading } from '@/features/safety/SafetyArticle'
import SafetyHubSearch from '@/features/safety/SafetyHubSearch'
import { hubSearch } from '@/features/safety/hub-search'
import EntryPage, { generateMetadata, generateStaticParams } from '@/app/(content)/mozhno-li/[slug]/page'
import Hub, { generateMetadata as hubMetadata } from '@/app/(content)/mozhno-li/page'
import ToxinArticle from '@/app/(content)/otravlenie/[slug]/page'
import { nonePublished, onlyPublished, withReviewStatus } from './review-states'

/**
 * The public «Можно ли» pages (SAFE-05): one page per reference entry and a
 * hub that searches in the browser. Production shows published entries only;
 * a Vercel preview shows the rest too, marked and `noindex`.
 *
 * Which entries are drafts or published is whatever the content files say on
 * the day, so every case that depends on it sets the statuses itself
 * (`withReviewStatus`) instead of relying on a real entry's status.
 * `shokolad` is used for its text (a food with a poisoning page), never for
 * its status.
 */

const SLUG = 'shokolad'
const params = (slug: string) => ({ params: Promise.resolve({ slug }) })
const html = (element: ReactElement) => renderToStaticMarkup(element)

function matched(path: string): boolean {
  return config.matcher.some(pattern => new RegExp(`^${pattern}$`).test(path))
}

afterEach(() => vi.unstubAllEnvs())

describe('the entry pages on a preview', () => {
  beforeEach(() => vi.stubEnv('VERCEL_ENV', 'preview'))

  it('are prerendered for every entry, published or not', () =>
    withReviewStatus(onlyPublished(SLUG), () => {
      const slugs = generateStaticParams().map(p => p.slug)
      expect(slugs).toEqual(visibleEntries().map(entry => entry.slug))
      expect(slugs).toContain(SLUG)
      expect(slugs.length).toBeGreaterThan(1)
    }))

  it('have a short title, the summary as description and a canonical', async () => {
    const entry = entryBySlug(SLUG)!
    const meta = await generateMetadata(params(SLUG))
    expect(typeof meta.title).toBe('string')
    expect((meta.title as string).length).toBeLessThanOrEqual(60)
    expect([entry.bySpecies.dog.summary.ru, entry.bySpecies.cat.summary.ru]).toContain(meta.description)
    expect(meta.description!.length).toBeLessThanOrEqual(160)
    expect(meta.alternates?.canonical).toBe('/mozhno-li/shokolad')
  })

  it.each(['draft', 'agent_reviewed'] as const)('are noindex and marked while %s', status =>
    withReviewStatus(nonePublished(status), async () => {
      expect((await generateMetadata(params(SLUG))).robots).toMatchObject({ index: false })
      expect(html(createElement(SafetyArticle, { entry: entryBySlug(SLUG)! }))).toContain('Черновик')
    }))

  it('are indexable and unmarked once published', () =>
    withReviewStatus(onlyPublished(SLUG), async () => {
      expect((await generateMetadata(params(SLUG))).robots).toBeUndefined()
      const page = html(createElement(SafetyArticle, { entry: entryBySlug(SLUG)! }))
      expect(page).not.toContain('Черновик')
      expect(page).toContain('Подготовлено с помощью ИИ')
    }))

  it('keep every title within 60 characters and every description within 160', async () => {
    for (const entry of visibleEntries()) {
      const meta = await generateMetadata(params(entry.slug))
      expect((meta.title as string).length, entry.slug).toBeLessThanOrEqual(60)
      expect(meta.description!.length, entry.slug).toBeLessThanOrEqual(160)
    }
  })

  it('ask the question in the accusative, or fall back to the name', () => {
    const entry = entryBySlug(SLUG)!
    expect(safetyHeading(entry)).toBe('Можно ли кошкам и собакам шоколад?')
    expect(safetyHeading({ ...entry, titleRu: undefined })).toBe('Шоколад: можно ли кошкам и собакам')
  })

  it('give a FAQPage with the cat and the dog question, answered by the summaries', () => {
    const entry = entryBySlug(SLUG)!
    const faq = safetyFaqJsonLd(entry)
    expect(faq['@type']).toBe('FAQPage')
    expect(faq.mainEntity.map(q => q.name)).toEqual(['Можно ли кошке шоколад?', 'Можно ли собаке шоколад?'])
    expect(faq.mainEntity.map(q => q.acceptedAnswer.text)).toEqual([entry.bySpecies.cat.summary.ru, entry.bySpecies.dog.summary.ru])
  })

  it('show the heading, both species with their verdicts, what to do, sources and the JSON-LD', () => {
    const page = html(createElement(SafetyArticle, { entry: entryBySlug(SLUG)! }))
    expect(page).toContain('<h1>Можно ли кошкам и собакам шоколад?</h1>')
    expect(page).toMatch(/Кошкам[\s\S]*Нельзя[\s\S]*Собакам[\s\S]*Нельзя/)
    for (const title of ['Почему', 'Признаки', 'Если питомец уже съел', 'Что сделать сразу', 'Чего не делать', 'Источники']) {
      expect(page, title).toContain(title)
    }
    expect(page).toContain('href="/otravlenie/shokolad"')
    expect(page).toContain('href="/o-materialah"')
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

  it('never claim a vet checked them, published or not', async () => {
    for (const status of [nonePublished('draft'), () => 'published' as const]) {
      await withReviewStatus(status, () => {
        for (const entry of visibleEntries()) {
          expect(html(createElement(SafetyArticle, { entry })), entry.slug).not.toMatch(/провер\S* ветеринар|ветеринар\S* провер/i)
        }
      })
    }
  })

  it('and the poisoning pages link to each other', async () => {
    expect(entryForToxin('shokolad')!.slug).toBe(SLUG)
    expect(html(await ToxinArticle(params('shokolad')))).toContain(`href="${safetyPath(SLUG)}"`)
    // No entry for a poisoning without one.
    expect(entryForToxin('nothing-like-this')).toBeUndefined()
  })
})

describe('the entry pages in production', () => {
  // No VERCEL_ENV, NODE_ENV=test: what production shows.

  it.each(['draft', 'agent_reviewed'] as const)('build no page for an entry while %s, and it is a 404', status =>
    withReviewStatus(nonePublished(status), async () => {
      expect(generateStaticParams()).toEqual([])
      await expect(EntryPage(params(SLUG))).rejects.toMatchObject({ digest: expect.stringContaining('404') })
      expect(await generateMetadata(params(SLUG))).toEqual({})
    }))

  it('build the published entry only, indexable', () =>
    withReviewStatus(onlyPublished(SLUG, 'draft'), async () => {
      expect(generateStaticParams()).toEqual([{ slug: SLUG }])
      expect((await generateMetadata(params(SLUG))).robots).toBeUndefined()
      expect(html(await EntryPage(params(SLUG)))).toContain('<h1>Можно ли кошкам и собакам шоколад?</h1>')
      await expect(EntryPage(params('hlorofitum'))).rejects.toMatchObject({ digest: expect.stringContaining('404') })
    }))
})

describe('the hub', () => {
  it('is an empty state, noindex, when nothing is published (production)', () =>
    withReviewStatus(nonePublished(), () => {
      const page = html(Hub())
      expect(page).toContain('<h1>')
      expect(page).toContain('Справочник скоро появится')
      expect(page).toContain('href="/register?next=/pets/new"')
      expect(page).not.toContain('href="/mozhno-li/')
      expect(hubMetadata().robots).toMatchObject({ index: false })
    }))

  it('is noindex on a preview too while nothing is published, though it lists the entries', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    return withReviewStatus(nonePublished(), () => {
      expect(html(Hub())).toContain(`href="/mozhno-li/${SLUG}"`)
      expect(hubMetadata().robots).toMatchObject({ index: false })
    })
  })

  it('is indexable and lists the published entry once one is published (production)', () =>
    withReviewStatus(onlyPublished(SLUG), () => {
      expect(hubMetadata().robots).toBeUndefined()
      expect(hubMetadata().alternates?.canonical).toBe('/mozhno-li')
      const page = html(Hub())
      expect(page).toContain(`href="/mozhno-li/${SLUG}"`)
      expect(page).not.toContain('href="/mozhno-li/hlorofitum"')
      expect(page).not.toContain('Справочник скоро появится')
    }))

  it('lists every visible entry as a link, by category, before any script runs', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const page = html(Hub())
    for (const entry of visibleEntries()) expect(page, entry.slug).toContain(`href="/mozhno-li/${entry.slug}"`)
    for (const title of ['Продукты', 'Растения', 'Лекарства', 'Быт']) expect(page, title).toContain(title)
  })

  it('draws no search field without JavaScript: the field would do nothing', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(html(createElement(SafetyHubSearch, { index: safetyIndex('ru') }))).not.toContain('<input')
  })

  it('finds an entry by name, by alias and with a typo, and says when it has nothing', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const index = safetyIndex('ru')
    for (const query of ['шоколад', 'какао', 'шокалад']) {
      const result = hubSearch(index, query)
      expect(result.state, query).toBe('found')
      if (result.state === 'found') expect(result.items[0].slug, query).toBe(SLUG)
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
