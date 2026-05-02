import type { MetadataRoute } from 'next'
import { siteUrl } from '@/shared/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/dashboard',
          '/check',
          '/cats',
          '/admin',
          '/billing',
          '/api',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
