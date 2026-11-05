'use client'

import Link, { useLinkStatus } from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { formatCount } from '@/shared/i18n/plural'
import type { AdminStatisticsPeriod } from '@/shared/types/admin'
import { ADMIN_TABS, adminTabHref, type AdminTab } from './tabs'

const PERIODS: AdminStatisticsPeriod[] = [7, 30, 90]

/** The head of every statistics tab: title, period, tabs; the footnote under it. */
export default function AdminFrame({
  tab,
  days,
  children,
}: {
  tab: AdminTab
  days: AdminStatisticsPeriod
  children: React.ReactNode
}) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.admin.statistics
  const d = dict.admin.dashboard

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="admin-period">
          <span id="admin-period-label" className="admin-period-label">{t.period}</span>
          <div className="segmented" role="group" aria-labelledby="admin-period-label">
            {PERIODS.map(period => (
              <Link
                key={period}
                href={adminTabHref(tab, period)}
                replace
                scroll={false}
                aria-current={days === period ? 'true' : undefined}
              >
                <PendingLabel text={formatCount(t.periodDays, period, locale)} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <nav className="admin-tabs" aria-label={d.tabsLabel}>
        {ADMIN_TABS.map(name => (
          <Link key={name} href={adminTabHref(name, days)} aria-current={name === tab ? 'page' : undefined}>
            <PendingLabel text={d.tabs[name]} />
          </Link>
        ))}
      </nav>

      <p className="small muted admin-change-note">{d.changeNote}</p>

      {children}

      <p className="footnote admin-footnote">{d.footnote}</p>
    </>
  )
}

/** A link being followed dims until its page arrives. */
function PendingLabel({ text }: { text: string }) {
  const { pending } = useLinkStatus()
  return <span className={pending ? 'is-pending' : undefined}>{text}</span>
}
