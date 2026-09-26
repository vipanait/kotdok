import type { MetadataRoute } from 'next'
import { siteUrl } from '@/shared/seo'

const lastModified = new Date('2026-05-02')

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1,
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
