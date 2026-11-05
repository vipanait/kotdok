'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminUsers } from '@/shared/types/admin'
import { metricChange, ratioChange, ratioValue } from './change'
import CohortTable from './CohortTable'
import DailyChart, { CHART } from './DailyChart'
import { formatNumber, formatPercent } from './format'
import ShareBars from './ShareBars'
import StatTile from './StatTile'

/** Growth, activity and returns of people. */
export default function UsersTab({ users }: { users: AdminUsers }) {
  const locale = useLocale()
  const t = useTranslations().admin.dashboard.users
  const dau = users.dauAvg

  return (
    <>
      <section className="admin-tiles" aria-label={t.accounts}>
        <StatTile
          label={t.accounts}
          value={formatNumber(users.accounts.total, locale)}
          note={t.addedNote.replace('{n}', formatNumber(users.accounts.added, locale))}
        />
        <StatTile
          label={t.dauAvg}
          value={formatNumber(dau.cur, locale, 1)}
          change={metricChange({ cur: dau.cur, prev: dau.prev })}
        />
        <StatTile label={t.active7d} value={formatNumber(users.active7d.cur, locale)} change={metricChange(users.active7d)} />
        <StatTile label={t.activation} value={formatPercent(ratioValue(users.activation.cur), locale)} change={ratioChange(users.activation)} />
        <StatTile label={t.returning} value={formatPercent(ratioValue(users.returning.cur), locale)} change={ratioChange(users.returning)} />
      </section>

      <div className="grid2 admin-charts">
        <DailyChart
          id="users"
          title={t.dailyChart}
          data={users.daily}
          series={[
            { key: 'registrations', label: t.registrations, color: CHART.sand },
            { key: 'active', label: t.active, color: CHART.teal },
          ]}
        />
        <section className="card" aria-labelledby="admin-providers">
          <h2 id="admin-providers">{t.providers}</h2>
          <ShareBars
            label={t.providers}
            items={Object.entries(users.providers).map(([name, count]) => ({ label: t.providerNames[name] ?? name, count }))}
          />
          <h2 className="admin-subhead">{t.locales}</h2>
          <ShareBars
            label={t.locales}
            items={Object.entries(users.locales).map(([name, count]) => ({ label: t.localeNames[name] ?? name, count }))}
          />
        </section>
      </div>

      <section className="card admin-section" aria-labelledby="admin-cohorts">
        <h2 id="admin-cohorts">{t.cohorts}</h2>
        <p className="small muted">{t.cohortsHint}</p>
        <CohortTable cohorts={users.cohorts} />
      </section>
    </>
  )
}
