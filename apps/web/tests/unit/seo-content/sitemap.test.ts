import { afterEach, describe, expect, it, vi } from 'vitest'
import { allContent } from '@/features/seo-content/load'
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
})
