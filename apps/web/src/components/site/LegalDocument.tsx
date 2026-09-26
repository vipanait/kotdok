import type { ReactNode } from 'react'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'

/**
 * The frame of a legal document: the texts are Russian-only and published word
 * for word, so only what surrounds them (header, footer, eyebrow, the note for
 * English readers) follows the site language.
 */
export default async function LegalDocument({
  title,
  edition,
  children,
  after,
}: {
  title: string
  /** «Редакция от …» */
  edition: string
  children: ReactNode
  /** Under the document, outside it: a link onwards. */
  after?: ReactNode
}) {
  const [locale, user] = await Promise.all([getLocale(), getAuthUser()])
  const dict = await getDictionary(locale)
  const t = dict.legal

  return (
    <>
      <PublicHeader dict={dict} account={user ? 'cabinet' : 'sign-in'} />
      <main className="reading legal">
        <div className="eyebrow">{t.eyebrow}</div>
        <div lang="ru">
          <h1>{title}</h1>
          <p className="legal-edition">{edition}</p>
        </div>
        {locale !== 'ru' && <p className="banner legal-language">{t.russianOnly}</p>}

        <article className="card legal-doc" lang="ru">
          {children}
        </article>

        {after}
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

/** «Редакция от 26 сентября 2026 г.» from an ISO date. */
export function editionOf(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return `Редакция от ${formatted}`
}
