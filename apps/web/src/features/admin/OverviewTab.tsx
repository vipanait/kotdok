'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminFeedbackRow, AdminOverview } from '@/shared/types/admin'
import { metricChange, ratioChange, ratioValue } from './change'
import CommentList from './CommentList'
import DailyChart, { CHART } from './DailyChart'
import { formatNumber, formatPercent } from './format'
import StatTile from './StatTile'
import { adminTabHref } from './tabs'

/** The main figures on one screen, the daily chart and the latest comments. */
export default function OverviewTab({ overview, comments }: { overview: AdminOverview; comments: AdminFeedbackRow[] }) {
  const locale = useLocale()
  const t = useTranslations().admin.dashboard.overview

  return (
    <>
      <section className="admin-tiles" aria-label={t.checks}>
        <StatTile label={t.newUsers} value={formatNumber(overview.newUsers.cur, locale)} change={metricChange(overview.newUsers)} />
        <StatTile label={t.active7d} value={formatNumber(overview.active7d.cur, locale)} change={metricChange(overview.active7d)} />
        <StatTile label={t.checks} value={formatNumber(overview.checks.cur, locale)} change={metricChange(overview.checks)} />
        <StatTile label={t.helpful} value={formatPercent(ratioValue(overview.helpful.cur), locale)} change={ratioChange(overview.helpful)} />
        <StatTile label={t.failures} value={formatPercent(ratioValue(overview.failures.cur), locale)} change={ratioChange(overview.failures)} />
        <StatTile
          label={t.extraRequests}
          value={formatNumber(overview.extraRequests.cur, locale)}
          change={metricChange(overview.extraRequests, 'count')}
        />
      </section>

      <div className="grid2 admin-charts">
        <DailyChart
          id="overview"
          title={t.dailyChart}
          data={overview.daily}
          series={[
            { key: 'registrations', label: t.registrations, color: CHART.sand },
            { key: 'checks', label: t.checksSeries, color: CHART.teal },
          ]}
        />
        <section className="card" aria-labelledby="admin-latest-comments">
          <div className="admin-card-head">
            <h2 id="admin-latest-comments">{t.latestComments}</h2>
            <Link href={adminTabHref('feedback', overview.days)} className="small">{t.allComments} →</Link>
          </div>
          <CommentList rows={comments} />
        </section>
      </div>
    </>
  )
}
