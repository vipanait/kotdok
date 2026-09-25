import Link from 'next/link'
import LocaleSwitch from '@/components/site/LocaleSwitch'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

export default function PublicFooter({ dict }: { dict: Dictionary }) {
  const t = dict.site
  return (
    <footer className="public-footer">
      <span>{t.tagline}</span>
      <div className="row">
        <Link href="/legal">{t.terms}</Link>
        <Link href="/account-deletion">{t.accountDeletion}</Link>
        <LocaleSwitch />
      </div>
    </footer>
  )
}
