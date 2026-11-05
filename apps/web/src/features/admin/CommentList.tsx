'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminFeedbackFeedFilter, AdminFeedbackRow, AdminStatisticsPeriod } from '@/shared/types/admin'
import CheckDetails from './CheckDetails'
import { formatMoment } from './format'
import { adminTabHref } from './tabs'

const FILTERS: AdminFeedbackFeedFilter[] = ['all', 'disliked', 'liked']
const STEP = 50
const EXCERPT = 60

export interface CommentListControls {
  days: AdminStatisticsPeriod
  filter: AdminFeedbackFeedFilter
  shown: number
  hasMore: boolean
}

function feedbackHref(days: AdminStatisticsPeriod, filter: AdminFeedbackFeedFilter, shown?: number): string {
  const extra: Record<string, string> = {}
  if (filter !== 'all') extra.filter = filter
  if (shown) extra.shown = String(shown)
  return adminTabHref('feedback', days, extra)
}

/**
 * Comments on answers, newest first. A comment on a check opens into that
 * check; feedback from before ratings belonged to a check says so. With
 * `controls` (the feedback tab) it has filters and «Показать ещё».
 */
export default function CommentList({ rows, controls }: { rows: AdminFeedbackRow[]; controls?: CommentListControls }) {
  const d = useTranslations().admin.dashboard
  const t = d.feedback

  return (
    <>
      {controls && (
        <div className="segmented admin-filters" role="group" aria-label={t.filtersLabel}>
          {FILTERS.map(name => (
            <Link
              key={name}
              href={feedbackHref(controls.days, name)}
              replace
              scroll={false}
              aria-current={name === controls.filter ? 'true' : undefined}
            >
              {t.filters[name]}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="small muted">{d.overview.noComments}</p>
      ) : (
        <ul className="admin-comments">
          {rows.map(row => (
            <li key={row.id}>
              {row.check ? (
                <details className="admin-feed-row">
                  <summary className="admin-comment-summary">
                    <CommentLine row={row} />
                  </summary>
                  <CheckDetails row={row.check} />
                </details>
              ) : (
                <div className="admin-comment-summary">
                  <CommentLine row={row} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {controls?.hasMore && (
        <Link className="button secondary admin-more" href={feedbackHref(controls.days, controls.filter, controls.shown + STEP)} scroll={false}>
          {d.checks.showMore}
        </Link>
      )}
    </>
  )
}

function CommentLine({ row }: { row: AdminFeedbackRow }) {
  const locale = useLocale()
  const d = useTranslations().admin.dashboard
  const check = row.check
  const about = check
    ? [
        check.species ? d.checks.speciesIcon[check.species] : null,
        `«${check.symptoms.length > EXCERPT ? `${check.symptoms.slice(0, EXCERPT).trimEnd()}…` : check.symptoms}»`,
      ]
        .filter(Boolean)
        .join(' ')
    : d.feedback.noCheck

  return (
    <>
      <span className="admin-rating" aria-label={d.rating[row.rating === 'liked' ? 'likedLabel' : 'dislikedLabel']}>
        {d.rating[row.rating]}
      </span>
      <span className="admin-comment-text">{row.comment}</span>
      <time className="small muted" dateTime={row.at}>{formatMoment(row.at, locale)}</time>
      <span className="admin-comment-about small muted">
        {check?.urgency && <span className={`admin-chip is-${check.urgency}`}>{d.urgency[check.urgency]}</span>} {about}
      </span>
    </>
  )
}
