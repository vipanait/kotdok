import { afterEach, describe, expect, it, vi } from 'vitest'
import { allContent } from '@/features/seo-content/load'
import { nonePublished, onlyPublished, withReviewStatus } from '../safety/review-states'
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

  it('leaves the «Можно ли» hub and every entry out while nothing is published, even on a preview', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    return withReviewStatus(nonePublished(), () => {
      const urls = sitemap().map(entry => entry.url)
      // An empty hub is not worth a crawl: it joins the sitemap with its first entry.
      expect(urls).not.toContain(`${siteUrl}/mozhno-li`)
      expect(urls.filter(url => url.startsWith(`${siteUrl}/mozhno-li`))).toEqual([])
    })
  })

  it('lists the hub and the published entries only, once one is published', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    return withReviewStatus(onlyPublished('shokolad', 'draft'), () => {
      const urls = sitemap().map(item => item.url)
      expect(urls).toContain(`${siteUrl}/mozhno-li`)
      expect(urls.filter(url => url.startsWith(`${siteUrl}/mozhno-li/`))).toEqual([`${siteUrl}/mozhno-li/shokolad`])
      expect(new Set(urls).size).toBe(urls.length)
    })
  })
})
