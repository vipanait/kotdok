import Link from 'next/link'
import type { ReactNode } from 'react'
import PublicHeader from '@/components/site/PublicHeader'
import ru from '@/shared/i18n/dictionaries/ru'

export interface Crumb {
  href: string
  name: string
}

/**
 * Header, breadcrumbs and footer of an article. The header is the site's own;
 * the footer has no language switch, because these pages are Russian only and
 * read no cookie.
 */
export default function ArticleFrame({ crumbs, children }: { crumbs?: Crumb[]; children: ReactNode }) {
  return (
    <>
      <PublicHeader dict={ru} account="sign-in" />
      <main className="reading article">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Навигация по разделу" className="crumbs">
            <ol>
              <li><Link href="/">Лапка</Link></li>
              {crumbs.map((crumb, i) => (
                <li key={crumb.href}>
                  {i === crumbs.length - 1 ? <span aria-current="page">{crumb.name}</span> : <Link href={crumb.href}>{crumb.name}</Link>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {children}
      </main>
      <footer className="public-footer">
        <span>{ru.site.tagline}</span>
        <div className="row">
          <Link href="/simptomy">Симптомы</Link>
          <Link href="/otravlenie">Отравления</Link>
          <Link href="/o-materialah">О материалах</Link>
          <Link href="/legal">{ru.site.terms}</Link>
        </div>
      </footer>
    </>
  )
}

/** Crumbs as schema.org BreadcrumbList, the home page first. */
export function breadcrumbJsonLd(siteUrl: string, crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [{ href: '/', name: 'Лапка' }, ...crumbs].map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${siteUrl}${crumb.href === '/' ? '' : crumb.href}`,
    })),
  }
}
