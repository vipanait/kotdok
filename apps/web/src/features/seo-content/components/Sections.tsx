import Link from 'next/link'
import type { ReactNode } from 'react'
import type { PageLink } from '../load'

export function ListSection({ id, title, items, ordered = false, children }: {
  id: string
  title: string
  items: string[]
  ordered?: boolean
  children?: ReactNode
}) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <section aria-labelledby={id} className="article-section">
      <h2 id={id}>{title}</h2>
      {children}
      <List className="article-list">
        {items.map(item => <li key={item}>{item}</li>)}
      </List>
    </section>
  )
}

export function FaqSection({ faq }: { faq: { question: string; answer: string }[] }) {
  return (
    <section aria-labelledby="faq-title" className="article-section">
      <h2 id="faq-title">Частые вопросы</h2>
      <div className="card faq">
        {faq.map(item => (
          <details key={item.question} className="disclosure">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function RelatedSection({ links }: { links: PageLink[] }) {
  if (links.length === 0) return null
  return (
    <section aria-labelledby="related-title" className="article-section">
      <h2 id="related-title">Похожие симптомы</h2>
      <ul className="related">
        {links.map(link => <li key={link.href}><Link href={link.href} className="link">{link.name}</Link></li>)}
      </ul>
    </section>
  )
}

export function SourcesSection({ sources }: { sources: { title: string; url?: string }[] }) {
  return (
    <section aria-labelledby="sources-title" className="article-section sources">
      <h2 id="sources-title">Источники</h2>
      <ul>
        {sources.map(source => (
          <li key={source.title}>{source.url ? <a href={source.url} rel="noopener">{source.title}</a> : source.title}</li>
        ))}
      </ul>
    </section>
  )
}

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** «25 октября 2026» from a `YYYY-MM-DD` date; read as UTC so no zone shifts the day. */
export function russianDate(iso: string): string {
  return DATE.format(new Date(`${iso}T00:00:00Z`)).replace(/\s*г\.$/, '')
}

/**
 * Who prepared the text and when it was checked. Honest about it: drafted
 * with AI and checked by a second automated review against the urgency rules
 * of the app — no vet's name, because no vet signed it.
 */
export function Byline({ reviewedAt, draft }: { reviewedAt?: string; draft: boolean }) {
  return (
    <p className="byline">
      {draft ? (
        <strong className="draft-mark">Черновик: страница ещё не опубликована и не проверена.</strong>
      ) : (
        <>
          Подготовлено редакцией Лапки с помощью ИИ{reviewedAt ? `, проверено ${russianDate(reviewedAt)}` : ''}.{' '}
        </>
      )}{' '}
      <Link href="/o-materialah" className="link">Как мы готовим материалы</Link>
    </p>
  )
}
