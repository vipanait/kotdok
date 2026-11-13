import { afterEach, describe, expect, it, vi } from 'vitest'
import { allContent } from '@/features/seo-content/load'
import { allEntries, publishedEntries } from '@/features/safety/load'
import sitemap from '@/app/sitemap'
import { siteUrl } from '@/shared/seo'

describe('the sitemap', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('lists the hubs and every published article, and no draft even on a preview', () => {
    // A preview shows drafts on the pages; the sitemap must still leave them out.
    vi.stubEnv('VERCEL_ENV', 'preview')
    const urls = sitemap().map(entry => entry.url)
    const { symptoms, toxins } = allContent()

    for (const hub of ['/simptomy', '/simptomy/koshki', '/simptomy/sobaki', '/otravlenie', '/o-materialah']) {
      expect(urls).toContain(`${siteUrl}${hub}`)
    }
    for (const page of symptoms) {
      expect(urls.includes(`${siteUrl}/simptomy/${page.slug}`), page.slug).toBe(page.review.status === 'published')
    }
    for (const page of toxins) {
      expect(urls.includes(`${siteUrl}/otravlenie/${page.slug}`), page.slug).toBe(page.review.status === 'published')
    }
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('lists the «Можно ли» hub and only published entries, the hub only once there is one', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const urls = sitemap().map(entry => entry.url)
    for (const entry of allEntries()) {
      expect(urls.includes(`${siteUrl}/mozhno-li/${entry.slug}`), entry.slug).toBe(entry.review.status === 'published')
    }
    // An empty hub is not worth a crawl: it joins the sitemap with its first entry.
    expect(urls.includes(`${siteUrl}/mozhno-li`)).toBe(publishedEntries().length > 0)
  })

  it('lists an entry and the hub once the entry is published', () => {
    // The loader caches the parsed files; publishing one in that cache is publishing it for this test.
    const entry = allEntries().find(e => e.slug === 'shokolad')!
    const review = entry.review
    entry.review = { ...review, status: 'published', reviewedAt: '2026-11-13' }
    try {
      const urls = sitemap().map(item => item.url)
      expect(urls).toContain(`${siteUrl}/mozhno-li`)
      expect(urls).toContain(`${siteUrl}/mozhno-li/shokolad`)
      expect(new Set(urls).size).toBe(urls.length)
    } finally {
      entry.review = review
    }
  })
})
