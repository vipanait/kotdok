import Link from 'next/link'
import LapkaLogo from '@/components/LapkaLogo'
import Icon, { type IconName } from '@/components/ui/Icon'
import SignOutForm from '@/features/auth/SignOutForm'
import type { CabinetUser } from '@/server/cabinet/load-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { formatCount } from '@/shared/i18n/plural'

export type CabinetSection = 'overview' | 'pets' | 'check' | 'history'

const SECTIONS: { key: CabinetSection; href: string; icon: IconName }[] = [
  { key: 'overview', href: '/dashboard', icon: 'home' },
  { key: 'pets', href: '/pets', icon: 'paw' },
  { key: 'check', href: '/check', icon: 'check' },
  { key: 'history', href: '/checks', icon: 'history' },
]

interface Props {
  cabinet: CabinetUser
  /** Highlighted section in the sidebar and the bottom navigation. */
  active?: CabinetSection
  /** Where the page sits, shown at the top on desktop: "Личный кабинет / Питомцы". */
  crumb: string
  children: React.ReactNode
}

/**
 * Frame of every signed-in page: a sidebar on desktop, a bottom navigation
 * under 760px, and the balance reachable from both.
 */
export default async function CabinetShell({ cabinet, active, crumb, children }: Props) {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.shell
  const labels: Record<CabinetSection, string> = {
    overview: t.overview,
    pets: t.pets,
    check: t.check,
    history: t.history,
  }
  const shortLabels: Record<CabinetSection, string> = { ...labels, check: t.checkShort }
  const initial = (cabinet.email.trim()[0] ?? '·').toUpperCase()

  return (
    <>
      <a href="#main" className="skip-link">{t.skipToContent}</a>

      <aside className="sidebar">
        <Link href="/" aria-label={dict.site.homeAria}>
          <LapkaLogo className="logo" />
        </Link>
        <nav aria-label={t.navLabel}>
          {SECTIONS.map(section => (
            <Link
              key={section.key}
              href={section.href}
              className="navlink"
              aria-current={section.key === active ? 'page' : undefined}
            >
              <Icon name={section.icon} />
              {labels[section.key]}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="credit-mini">
            {t.creditsAvailable}
            <strong>{cabinet.credits}</strong>
            <Link href="/credits" className="link">
              {t.creditsMore}
              <Icon name="arrow" />
            </Link>
          </div>
          {cabinet.isAdmin && (
            <Link href="/admin/statistics" className="navlink">
              <Icon name="chart" />
              {t.statistics}
            </Link>
          )}
          <Link href="/account-deletion" className="navlink">
            <Icon name="user" />
            {t.accountDeletion}
          </Link>
          <SignOutForm label={t.signOut} className="navlink" icon={<Icon name="logout" />} />
          <div className="sidebar-legal">
            <Link href="/legal">{t.terms}</Link>
          </div>
        </div>
      </aside>

      <div className="cabinet">
        <header className="topbar">
          <span className="crumb">{crumb}</span>
          <Link href="/dashboard" className="mobile-brand" aria-label={t.account}>
            <LapkaLogo className="logo" />
          </Link>
          <div className="row">
            <span className="user-email">{cabinet.email}</span>
            <Link href="/credits" className="mobile-balance pill">
              {formatCount(t.creditsCount, cabinet.credits, locale)}
            </Link>
            <details className="account-menu">
              <summary className="user-dot" aria-label={t.accountMenu}>
                <span aria-hidden>{initial}</span>
              </summary>
              <div className="account-menu-panel">
                <p className="account-menu-email">{cabinet.email}</p>
                {cabinet.isAdmin && (
                  <Link href="/admin/statistics" className="navlink">
                    <Icon name="chart" />
                    {t.statistics}
                  </Link>
                )}
                <Link href="/account-deletion" className="navlink">
                  <Icon name="user" />
                  {t.accountDeletion}
                </Link>
                <Link href="/legal" className="navlink">
                  <Icon name="info" />
                  {t.terms}
                </Link>
                <SignOutForm label={t.signOut} className="navlink" icon={<Icon name="logout" />} />
              </div>
            </details>
          </div>
        </header>

        <main id="main" className="workspace" tabIndex={-1}>
          {children}
          <p className="footnote" style={{ marginTop: 32 }}>{t.footnote}</p>
        </main>
      </div>

      <nav className="mobile-nav" aria-label={t.navLabel}>
        {SECTIONS.map(section => (
          <Link
            key={section.key}
            href={section.href}
            aria-current={section.key === active ? 'page' : undefined}
          >
            <Icon name={section.icon} />
            {shortLabels[section.key]}
          </Link>
        ))}
      </nav>
    </>
  )
}
