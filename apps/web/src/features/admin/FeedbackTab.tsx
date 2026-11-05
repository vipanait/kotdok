'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { ADMIN_URGENCIES, type AdminFeed, type AdminFeedback, type AdminFeedbackFeedFilter, type AdminFeedbackRow } from '@/shared/types/admin'
import { metricChange, ratioChange, ratioValue } from './change'
import CommentList from './CommentList'
import DailyChart, { CHART } from './DailyChart'
import { PERCENT_FROM } from './FollowupTable'
import { formatNumber, formatPercent } from './format'
import StatTile from './StatTile'

/** How useful the answers were, by day and by urgency, and what people wrote. */
export default function FeedbackTab({
  feedback,
  comments,
  filter,
  shown,
}: {
  feedback: AdminFeedback
  comments: AdminFeed<AdminFeedbackRow>
  filter: AdminFeedbackFeedFilter
  shown: number
}) {
  const locale = useLocale()
  const d = useTranslations().admin.dashboard
  const t = d.feedback

  return (
    <>
      <section className="admin-tiles" aria-label={t.ratings}>
        <StatTile label={t.ratings} value={formatNumber(feedback.ratings.cur, locale)} change={metricChange(feedback.ratings)} />
        <StatTile label={t.liked} value={formatPercent(ratioValue(feedback.liked.cur), locale)} change={ratioChange(feedback.liked)} />
        <StatTile
          label={t.ratedChecks}
          value={formatPercent(ratioValue(feedback.ratedChecks.cur), locale)}
          change={ratioChange(feedback.ratedChecks)}
        />
        <StatTile label={t.withComment} value={formatNumber(feedback.withComment.cur, locale)} change={metricChange(feedback.withComment)} />
      </section>

      <div className="grid2 admin-charts">
        <DailyChart
          id="feedback"
          title={t.dailyChart}
          data={feedback.daily}
          stacked
          series={[
            { key: 'liked', label: t.likedSeries, color: CHART.home_care },
            { key: 'disliked', label: t.dislikedSeries, color: CHART.emergency },
          ]}
        />
        <section className="card" aria-labelledby="admin-by-urgency">
          <h2 id="admin-by-urgency">{t.byUrgency}</h2>
          <p className="small muted">{t.byUrgencyHint}</p>
          <ul className="admin-shares" aria-label={t.byUrgency}>
            {ADMIN_URGENCIES.filter(urgency => feedback.byUrgency[urgency].rated > 0).map(urgency => {
              const { liked, rated } = feedback.byUrgency[urgency]
              const share = liked / rated
              return (
                <li key={urgency}>
                  <span className="admin-share-label">
                    <span className={`admin-chip is-${urgency}`}>{d.urgency[urgency]}</span>
                  </span>
                  <span className="admin-share-bar" aria-hidden>
                    <i style={{ width: `${Math.round(share * 100)}%` }} />
                  </span>
                  <span className="admin-share-value">
                    {rated < PERCENT_FROM
                      ? t.fewRatings.replace('{n}', formatNumber(rated, locale))
                      : `${formatPercent(share, locale)} · ${formatNumber(rated, locale)}`}
                  </span>
                </li>
              )
            })}
          </ul>
          {ADMIN_URGENCIES.every(urgency => feedback.byUrgency[urgency].rated === 0) && (
            <p className="small muted">{d.noShares}</p>
          )}
        </section>
      </div>

      <section className="card admin-section" aria-labelledby="admin-comments" id="feed">
        <h2 id="admin-comments">{t.comments}</h2>
        <CommentList
          rows={comments.rows}
          controls={{ days: feedback.days, filter, shown, hasMore: comments.hasMore }}
        />
      </section>
    </>
  )
}
