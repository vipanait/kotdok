'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminCohort } from '@/shared/types/admin'
import { formatNumber, formatPercent } from './format'

const DAY_MS = 24 * 60 * 60 * 1000

/** "14–20 сент." within a month, "28 сент. – 4 окт." across two. */
function weekName(weekStart: string, locale: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(start.getTime() + 6 * DAY_MS)
  const tag = locale === 'ru' ? 'ru-RU' : 'en-US'
  const day = (date: Date) => date.toLocaleDateString(tag, { day: 'numeric', timeZone: 'UTC' })
  const dayMonth = (date: Date) => date.toLocaleDateString(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${dayMonth(end)}`
    : `${dayMonth(start)} – ${dayMonth(end)}`
}

/** Weekly cohorts of sign-ups: the share of each who did something in weeks 0..4 after. */
export default function CohortTable({ cohorts }: { cohorts: AdminCohort[] }) {
  const locale = useLocale()
  const t = useTranslations().admin.dashboard.users
  const weeks = [0, 1, 2, 3, 4]

  return (
    <div className="admin-table-scroll">
      <table className="admin-table admin-cohorts">
        <thead>
          <tr>
            <th scope="col">{t.cohortWeek}</th>
            <th scope="col">{t.cohortSize}</th>
            {weeks.map(k => (
              <th key={k} scope="col">{t.cohortN.replace('{n}', String(k))}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map(cohort => (
            <tr key={cohort.weekStart}>
              <th scope="row">{weekName(cohort.weekStart, locale)}</th>
              <td>{formatNumber(cohort.size, locale)}</td>
              {weeks.map(k => {
                const active = cohort.active[k]
                if (active === null || active === undefined) return <td key={k} />
                if (cohort.size === 0) return <td key={k}>—</td>
                const share = active / cohort.size
                return (
                  <td key={k} style={{ background: `rgb(11 107 94 / ${(0.06 + share * 0.5).toFixed(2)})` }}>
                    {formatPercent(share, locale)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
