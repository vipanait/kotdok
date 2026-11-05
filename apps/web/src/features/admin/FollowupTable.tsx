'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminFollowupStatistics } from '@/shared/types/admin'
import { formatNumber } from './format'

/** Below this many, a percentage says more than it knows. */
export const PERCENT_FROM = 10

function share(part: number, of: number, locale: string): string {
  const count = formatNumber(part, locale)
  if (of < PERCENT_FROM) return `${count} (${formatNumber(of, locale)})`
  return `${count} · ${Math.round((part / of) * 100)}% (${formatNumber(of, locale)})`
}

/**
 * What became of pets after a check (FU-04): offered and turned on, answered,
 * the first answer by level, the rule's vet advice, visits, re-checks, how the
 * cases ended. Counted in SQL, over cases whose first check is in the period.
 */
export default function FollowupTable({ data }: { data: AdminFollowupStatistics }) {
  const locale = useLocale()
  const t = useTranslations().admin.statistics
  const sources = Object.entries(data.firstSource).sort((a, b) => b[1] - a[1])
  return (
    <section className="card admin-followup" aria-labelledby="admin-followup-title">
      <h2 id="admin-followup-title">{t.followupTitle}</h2>
      <p className="small muted">{t.followupSubtitle}</p>
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t.followupLevel}</th>
              <th scope="col">{t.followupOffered}</th>
              <th scope="col">{t.followupEnabled}</th>
              <th scope="col">{t.followupAnswered}</th>
              <th scope="col">{t.followupFirst}</th>
              <th scope="col">{t.followupEscalated}</th>
              <th scope="col">{t.followupVet}</th>
              <th scope="col">{t.followupRecheck}</th>
              <th scope="col">{t.followupMedian}</th>
              <th scope="col">{t.followupSaved}</th>
              <th scope="col">{t.followupOutcomes}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => {
              const outcomes = Object.entries(row.outcomes)
                .filter(([, count]) => count > 0)
                .map(([name, count]) => `${t.followupOutcomeNames[name as keyof typeof row.outcomes]} ${formatNumber(count, locale)}`)
              if (row.open > 0) outcomes.push(`${t.followupOpen} ${formatNumber(row.open, locale)}`)
              return (
                <tr key={row.urgency}>
                  <th scope="row">{t.followupUrgency[row.urgency]}</th>
                  <td>{formatNumber(row.offered, locale)}</td>
                  <td>{share(row.enabled, row.offered, locale)}</td>
                  <td>{share(row.answered, row.enabled, locale)}</td>
                  <td>
                    {row.answered === 0
                      ? '—'
                      : [row.firstBetter, row.firstSame, row.firstWorse].map(count => share(count, row.answered, locale)).join(' / ')}
                  </td>
                  <td>{share(row.escalated, row.enabled, locale)}</td>
                  <td>{row.firstVetAsked === 0 ? '—' : share(row.firstVetYes, row.firstVetAsked, locale)}</td>
                  <td>{row.rechecked === 0 ? '0' : `${formatNumber(row.rechecked, locale)} (${formatNumber(row.recheckRaised, locale)})`}</td>
                  <td>{row.medianHoursToBetter === null ? '—' : t.followupHours.replace('{n}', formatNumber(row.medianHoursToBetter, locale, 1))}</td>
                  <td>{share(row.savedToRecord, row.outcomes.improved, locale)}</td>
                  <td>{outcomes.length > 0 ? outcomes.join(', ') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <h3>{t.followupSources}</h3>
      <p className="small">
        {sources.length === 0
          ? t.followupNoSources
          : sources.map(([name, count]) => `${t.followupSourceNames[name] ?? name}: ${formatNumber(count, locale)}`).join(' · ')}
      </p>
    </section>
  )
}
