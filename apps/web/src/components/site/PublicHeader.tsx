import Link from 'next/link'
import LapkaLogo from '@/components/LapkaLogo'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

interface Props {
  dict: Dictionary
  /**
   * The sign-in button in the header. Auth pages hide it on every width: the
   * action is in their form, and the way between sign-in and sign-up is under
   * it. The landing keeps it.
   */
  account?: 'sign-in' | 'cabinet' | 'none'
}

export default function PublicHeader({ dict, account = 'sign-in' }: Props) {
  const t = dict.site
  return (
    <header className="public-header">
      <Link href="/" aria-label={t.homeAria}>
        <LapkaLogo className="logo" />
      </Link>
      <nav aria-label={t.about}>
        <Link href="/#how">{t.howItWorks}</Link>
        <Link href="/legal">{t.about}</Link>
        {account === 'sign-in' && (
          <Link href="/login" className="btn secondary">{t.signIn}</Link>
        )}
        {account === 'cabinet' && (
          <Link href="/dashboard" className="btn secondary">{t.toAccount}</Link>
        )}
      </nav>
    </header>
  )
}
