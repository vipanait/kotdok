import type { Metadata } from 'next'
import { defaultSeo, siteName, siteUrl, supportEmail } from '@/shared/seo'

export const organizationId = `${siteUrl}/#organization`

export const organizationJsonLd = {
  '@type': 'Organization',
  '@id': organizationId,
  name: 'Лапка',
  url: siteUrl,
  logo: {
    '@type': 'ImageObject',
    url: `${siteUrl}/icon.svg`,
  },
  contactPoint: {
    '@type': 'ContactPoint',
    email: supportEmail,
    contactType: 'customer support',
  },
}

/**
 * The site's own preview pictures (app/opengraph-image.tsx, twitter-image.tsx).
 * With two root layouts and none at the app root, Next no longer attaches the
 * root picture files to the pages, so they are named here. A page that sets
 * its own `openGraph` replaces the whole object and must repeat them.
 */
export const defaultOgImages = [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Лапка — AI симптомчекер для кошек и собак' }]
export const defaultTwitterImages = ['/twitter-image']

/** What every page starts from, in both root layouts. */
export const siteMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultSeo.title,
    template: `%s — ${siteName}`,
  },
  description: defaultSeo.description,
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName,
    title: defaultSeo.title,
    description: defaultSeo.description,
    images: defaultOgImages,
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultSeo.title,
    description: defaultSeo.description,
    images: defaultTwitterImages,
  },
  // Icons are auto-detected from the app metadata files; previews are named above.
}

/**
 * Structured data for a `<script type="application/ld+json">`. `<` becomes its
 * escape so no string in the data can close the script (Next's JSON-LD guide).
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
