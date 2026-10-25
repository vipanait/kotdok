import type { Metadata } from 'next'
import '../globals.css'
import { fontVariables } from '../fonts'
import { siteMetadata } from '@/shared/site-metadata'

export const metadata: Metadata = siteMetadata

/**
 * The root layout of the articles about symptoms and poisonings. Unlike the
 * app's layout it reads no cookie and no session, so every page under it is
 * prerendered once and served from the CDN; the texts are Russian only.
 * Navigating from here into the app is a full page load, which is fine: the
 * way out of an article is the sign-up page.
 */
export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
