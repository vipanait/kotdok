import type { Metadata } from 'next'
import './globals.css'
import { fontVariables } from './fonts'
import NotFound from './(frontend)/not-found'
import { LocaleProvider } from '@/components/LocaleProvider'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { siteMetadata } from '@/shared/site-metadata'

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale())
  return { ...siteMetadata, title: dict.errors.notFoundTitle, robots: { index: false, follow: false } }
}

/**
 * A URL no route matches, and an article slug that is not published: with
 * `dynamicParams = false` an unknown slug never reaches its segment, so it
 * lands here too. With two root layouts there is no single one to render the
 * 404 inside, so this page brings its own document around
 * `(frontend)/not-found.tsx`.
 */
export default async function GlobalNotFound() {
  const locale = await getLocale()
  const dict = await getDictionary(locale)

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <LocaleProvider locale={locale} dict={dict}>
          <NotFound />
        </LocaleProvider>
      </body>
    </html>
  )
}
