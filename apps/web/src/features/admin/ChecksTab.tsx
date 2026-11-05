'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminCheckFeedFilter, AdminCheckRow, AdminChecks, AdminFeed } from '@/shared/types/admin'
import AnswersBlock from './AnswersBlock'
import { metricChange, ratioChange, ratioValue } from './change'
import CheckFeed from './CheckFeed'
import DailyChart, { CHART } from './DailyChart'
import FollowupTable from './FollowupTable'
import { formatNumber, formatPercent } from './format'
import StatTile from './StatTile'

/** Checks: urgency, species, the questionnaire, failures, the feed and the follow-up loop. */
export default function ChecksTab({
  checks,
  feed,
  filter,
  shown,
}: {
  checks: AdminChecks
  feed: AdminFeed<AdminCheckRow>
  filter: AdminCheckFeedFilter
  shown: number
}) {
  const locale = useLocale()
  const d = useTranslations().admin.dashboard
  const t = d.checks
  const { cat, dog, unknown } = checks.species
  const species = cat + dog + unknown
  const perUser = (part: { num: number; den: number } | null) => (part && part.den > 0 ? part.num / part.den : null)
  const perUserNow = perUser(checks.perUser.cur)
  const perUserBefore = perUser(checks.perUser.prev)
  const codes = Object.entries(checks.failureCodes)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => `${code}: ${formatNumber(count, locale)}`)
    .join(', ')

  return (
    <>
      <section className="admin-tiles" aria-label={t.checks}>
        <StatTile label={t.checks} value={formatNumber(checks.checks.cur, locale)} change={metricChange(checks.checks)} />
        <StatTile
          label={t.species}
          value={species === 0 ? '—' : `${formatPercent(cat / species, locale)} / ${formatPercent(dog / species, locale)}`}
          note={t.speciesNote.replace('{n}', formatNumber(unknown, locale))}
        />
        <StatTile
          label={t.perUser}
          value={perUserNow === null ? '—' : formatNumber(perUserNow, locale, 1)}
          change={
            perUserNow === null || perUserBefore === null
              ? { kind: 'nodata' }
              : metricChange({ cur: perUserNow, prev: perUserBefore })
          }
        />
        <StatTile
          label={t.failures}
          value={formatPercent(ratioValue(checks.failures.cur), locale)}
          change={ratioChange(checks.failures)}
          note={codes || t.noFailures}
        />
        <StatTile
          label={t.extraRequests}
          value={formatNumber(checks.extraRequests.cur, locale)}
          change={metricChange(checks.extraRequests, 'count')}
          note={t.approvedNote.replace('{n}', formatNumber(checks.extraApproved, locale))}
        />
      </section>

      <DailyChart
        id="checks"
        title={t.dailyChart}
        data={checks.daily}
        stacked
        series={[
          { key: 'emergency', label: d.urgency.emergency, color: CHART.emergency },
          { key: 'urgent', label: d.urgency.urgent, color: CHART.urgent },
          { key: 'monitor', label: d.urgency.monitor, color: CHART.monitor },
          { key: 'home_care', label: d.urgency.home_care, color: CHART.home_care },
          { key: 'healthy', label: d.urgency.healthy, color: CHART.healthy },
        ]}
      />

      <AnswersBlock answers={checks.answers} />

      <CheckFeed feed={feed} filter={filter} days={checks.days} shown={shown} />

      <FollowupTable data={checks.followup} />
    </>
  )
}
