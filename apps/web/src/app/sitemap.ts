import type { MetadataRoute } from 'next'
import { symptomPages, toxinPages } from '@/features/seo-content/load'
import type { ContentPage } from '@/features/seo-content/schema'
import { siteUrl } from '@/shared/seo'

const lastModified = new Date('2026-05-02')

/** When an article last changed in substance: its last review, else today's build. */
function changed(page: ContentPage): Date {
  return page.review.reviewedAt ? new Date(page.review.reviewedAt) : new Date()
}

/** The newest change among the pages a hub lists. */
function newest(pages: ContentPage[]): Date {
  return pages.map(changed).reduce((a, b) => (a > b ? a : b), new Date('2026-10-25'))
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Only what is published: in production the loaders return nothing else, and
  // a draft visible on a preview must not leak into a sitemap built there.
  const symptoms = symptomPages().filter(page => page.review.status === 'published')
  const toxins = toxinPages().filter(page => page.review.status === 'published')

  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1,
    },
    { url: `${siteUrl}/simptomy`, lastModified: newest(symptoms), changeFrequency: 'weekly', priority: 0.8 },
    {
      url: `${siteUrl}/simptomy/koshki`,
      lastModified: newest(symptoms.filter(page => page.species === 'cat')),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/simptomy/sobaki`,
      lastModified: newest(symptoms.filter(page => page.species === 'dog')),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...symptoms.map(page => ({
      url: `${siteUrl}/simptomy/${page.slug}`,
      lastModified: changed(page),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${siteUrl}/otravlenie`, lastModified: newest(toxins), changeFrequency: 'monthly', priority: 0.7 },
    ...toxins.map(page => ({
      url: `${siteUrl}/otravlenie/${page.slug}`,
      lastModified: changed(page),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${siteUrl}/o-materialah`,
      lastModified: new Date('2026-10-25'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/legal`,
      lastModified: new Date('2026-09-26'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/legal/privacy`,
      lastModified: new Date('2026-09-26'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/legal/personal-data`,
      lastModified: new Date('2026-09-26'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
