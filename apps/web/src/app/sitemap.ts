import type { MetadataRoute } from 'next'
import { pathOf, publishedPages } from '@/features/seo-content/load'
import type { ContentPage, SymptomPage } from '@/features/seo-content/schema'
import { publishedEntries } from '@/features/safety/load'
import { safetyPath } from '@/shared/content-paths'
import { siteUrl } from '@/shared/seo'

const lastModified = new Date('2026-05-02')

/** When an article last changed in substance: its last review (a published page always has one). */
function changed(page: ContentPage): Date {
  return new Date(page.review.reviewedAt!)
}

/** The newest change among the pages a hub lists. */
function newest(pages: ContentPage[]): Date {
  return pages.map(changed).reduce((a, b) => (a > b ? a : b), new Date('2026-10-25'))
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Only what is published: a draft visible on a preview must not leak into a
  // sitemap built there.
  const published = publishedPages()
  const symptoms = published.filter((page): page is SymptomPage => page.kind === 'symptom')
  const toxins = published.filter(page => page.kind === 'toxin')
  // The «Можно ли» reference: published entries only, and the hub once there is one to list.
  const entries = publishedEntries()
  const entryChanged = (entry: (typeof entries)[number]) => new Date(entry.review.reviewedAt ?? '2026-11-13')
  const safety: MetadataRoute.Sitemap =
    entries.length === 0
      ? []
      : [
          {
            url: `${siteUrl}/mozhno-li`,
            lastModified: entries.map(entryChanged).reduce((a, b) => (a > b ? a : b)),
            changeFrequency: 'weekly',
            priority: 0.7,
          },
          ...entries.map(entry => ({
            url: `${siteUrl}${safetyPath(entry.slug)}`,
            lastModified: entryChanged(entry),
            changeFrequency: 'monthly' as const,
            priority: 0.6,
          })),
        ]

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
      url: `${siteUrl}${pathOf(page)}`,
      lastModified: changed(page),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${siteUrl}/otravlenie`, lastModified: newest(toxins), changeFrequency: 'monthly', priority: 0.7 },
    ...toxins.map(page => ({
      url: `${siteUrl}${pathOf(page)}`,
      lastModified: changed(page),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...safety,
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
