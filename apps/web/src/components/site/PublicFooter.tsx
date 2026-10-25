import Link from 'next/link'
import LocaleSwitch from '@/components/site/LocaleSwitch'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/**
 * The footer of the public site. The articles (`app/(content)`) are Russian
 * only and read no cookie, so they show their own links and no language switch.
 */
export default function PublicFooter({ dict, variant = 'site' }: { dict: Dictionary; variant?: 'site' | 'articles' }) {
  const t = dict.site
  return (
    <footer className="public-footer">
      <span>{t.tagline}</span>
      <div className="row">
        {variant === 'articles' ? (
          <>
            <Link href="/simptomy">{t.symptoms}</Link>
            <Link href="/otravlenie">Отравления</Link>
            <Link href="/o-materialah">О материалах</Link>
            <Link href="/legal">{t.terms}</Link>
          </>
        ) : (
          <>
            <Link href="/simptomy">{t.symptoms}</Link>
            <Link href="/legal">{t.terms}</Link>
            <Link href="/account-deletion">{t.accountDeletion}</Link>
            <LocaleSwitch />
          </>
        )}
      </div>
    </footer>
  )
}
