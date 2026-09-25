import type { Metadata } from 'next'
import Link from 'next/link'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import Illustration from '@/components/ui/Illustration'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale())
  return { title: dict.errors.notFoundTitle, robots: { index: false, follow: false } }
}

/**
 * Every unmatched URL and every `notFound()` of the site. A signed-in visitor
 * is offered the cabinet, anybody else the home page.
 */
export default async function NotFound() {
  const [locale, user] = await Promise.all([getLocale(), getAuthUser()])
  const dict = await getDictionary(locale)
  const t = dict.errors

  return (
    <>
      <PublicHeader dict={dict} account={user ? 'cabinet' : 'sign-in'} />
      <main className="reading error-page">
        <div className="empty">
          <Illustration name="welcome-pets" size={210} eager />
          <div className="eyebrow">{t.notFoundEyebrow}</div>
          <h1>{t.notFoundTitle}</h1>
          <p>{t.notFoundText}</p>
          <Link href={user ? '/dashboard' : '/'} className="btn primary">
            {user ? t.toAccount : t.toHome}
          </Link>
        </div>
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
