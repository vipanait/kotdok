import type { MetadataRoute } from 'next'

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
        ],
      },
    ],
    sitemap: 'https://kotdok.vercel.app/sitemap.xml',
  }
}
