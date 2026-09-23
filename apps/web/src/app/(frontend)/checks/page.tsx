import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SymptomCheckRecord } from '@lapka/contracts'
import CabinetShell from '@/components/cabinet/CabinetShell'
import HistoryRows from '@/components/cabinet/HistoryRows'
import Illustration from '@/components/ui/Illustration'
import { formatMonthHeading } from '@/features/symptom-check/check-options'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
import { loadCheckHistory } from '@/server/checks/load-check-pages'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { formatCount } from '@/shared/i18n/plural'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/** Newest first in, newest month first out, rows keeping their order. */
function groupByMonth(checks: SymptomCheckRecord[]) {
  const groups: { key: string; date: Date; checks: SymptomCheckRecord[] }[] = []
  for (const check of checks) {
    const date = new Date(check.created_at)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.checks.push(check)
    else groups.push({ key, date, checks: [check] })
  }
  return groups
}

export default async function ChecksPage() {
  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect('/login?next=/checks')

  const [checks, locale] = await Promise.all([loadCheckHistory(cabinet.user.id), getLocale()])
  const dict = await getDictionary(locale)
  const t = dict.history

  return (
    <CabinetShell cabinet={cabinet} active="history" crumb={t.crumb}>
      <div className="pagehead">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <Link href="/check" className="btn primary">{t.newCheck}</Link>
      </div>

      <section className="card">
        {checks.length === 0 ? (
          <div className="empty">
            <Illustration name="welcome-pets" size={210} />
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyText}</p>
            <Link href="/check" className="btn primary">{t.emptyAction}</Link>
          </div>
        ) : (
          groupByMonth(checks).map(group => (
            <section key={group.key} className="history-month" aria-labelledby={`month-${group.key}`}>
              <div className="section-head">
                <h2 id={`month-${group.key}`}>{formatMonthHeading(group.date, locale)}</h2>
                <span className="small muted">{formatCount(t.count, group.checks.length, locale)}</span>
              </div>
              <HistoryRows checks={group.checks} dict={dict} locale={locale} />
            </section>
          ))
        )}
      </section>
    </CabinetShell>
  )
}
