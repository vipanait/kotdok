import type { Metadata } from 'next'
import Link from 'next/link'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import Illustration from '@/components/ui/Illustration'
import { isSignedIn } from '@/server/auth/signed-in'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale())
  return { title: dict.errors.notFoundTitle, robots: { index: false, follow: false } }
}

/**
 * Every unmatched URL and every `notFound()` of the site, including an
 * article slug that does not exist (`app/global-not-found.tsx` renders this
 * for those). A signed-in visitor is offered the cabinet, anybody else the
 * home page; the articles are a link away for both.
 */
export default async function NotFound() {
  const [locale, signedIn] = await Promise.all([getLocale(), isSignedIn()])
  const dict = await getDictionary(locale)
  const t = dict.errors

  return (
    <>
      <PublicHeader dict={dict} account={signedIn ? 'cabinet' : 'sign-in'} />
      <main className="reading error-page">
        <div className="empty">
          <Illustration name="welcome-pets" size={210} eager />
          <div className="eyebrow">{t.notFoundEyebrow}</div>
          <h1>{t.notFoundTitle}</h1>
          <p>{t.notFoundText}</p>
          <div className="row not-found-actions">
            <Link href={signedIn ? '/dashboard' : '/'} className="btn primary">
              {signedIn ? t.toAccount : t.toHome}
            </Link>
            <Link href="/simptomy" className="btn secondary">{dict.site.symptoms}</Link>
          </div>
        </div>
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
