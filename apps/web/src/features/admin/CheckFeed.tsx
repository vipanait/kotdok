'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminCheckFeedFilter, AdminCheckRow, AdminFeed, AdminStatisticsPeriod } from '@/shared/types/admin'
import CheckDetails from './CheckDetails'
import { formatMoment, formatNumber } from './format'
import { adminTabHref } from './tabs'

const FILTERS: AdminCheckFeedFilter[] = ['all', 'urgent', 'disliked']
const EXCERPT = 80
const STEP = 50

function feedHref(days: AdminStatisticsPeriod, filter: AdminCheckFeedFilter, shown?: number): string {
  const extra: Record<string, string> = {}
  if (filter !== 'all') extra.filter = filter
  if (shown) extra.shown = String(shown)
  return adminTabHref('checks', days, extra)
}

/** The latest checks of the period; each opens into the whole check. */
export default function CheckFeed({
  feed,
  filter,
  days,
  shown,
}: {
  feed: AdminFeed<AdminCheckRow>
  filter: AdminCheckFeedFilter
  days: AdminStatisticsPeriod
  shown: number
}) {
  const t = useTranslations().admin.dashboard.checks

  return (
    <section className="card admin-section" aria-labelledby="admin-check-feed" id="feed">
      <div className="admin-card-head">
        <h2 id="admin-check-feed">{t.feedTitle}</h2>
        <div className="segmented" role="group" aria-label={t.filtersLabel}>
          {FILTERS.map(name => (
            <Link key={name} href={feedHref(days, name)} replace scroll={false} aria-current={name === filter ? 'true' : undefined}>
              {t.filters[name]}
            </Link>
          ))}
        </div>
      </div>

      {feed.rows.length === 0 ? (
        <p className="small muted">{t.emptyFeed}</p>
      ) : (
        <div className="admin-feed">
          {feed.rows.map(row => (
            <details key={row.id} className="admin-feed-row">
              <summary>
                <CheckSummary row={row} />
              </summary>
              <CheckDetails row={row} />
            </details>
          ))}
        </div>
      )}

      {feed.hasMore && (
        <Link className="button secondary admin-more" href={feedHref(days, filter, shown + STEP)} scroll={false}>
          {t.showMore}
        </Link>
      )}
    </section>
  )
}

/** The one line of a closed row: when, which pet, the start of the complaint, urgency, rating. */
export function CheckSummary({ row }: { row: AdminCheckRow }) {
  const locale = useLocale()
  const d = useTranslations().admin.dashboard
  const t = d.checks
  const pet = [
    row.species ? t.speciesIcon[row.species] : '—',
    row.petAgeYears === null ? null : t.ageYears.replace('{n}', formatNumber(row.petAgeYears, locale)),
  ]
    .filter(Boolean)
    .join(' ')
  const excerpt = row.symptoms.length > EXCERPT ? `${row.symptoms.slice(0, EXCERPT).trimEnd()}…` : row.symptoms

  return (
    <>
      <time className="small muted" dateTime={row.createdAt}>{formatMoment(row.createdAt, locale)}</time>
      <span className="admin-feed-pet">{pet}</span>
      <span className="admin-feed-text">{excerpt}</span>
      {row.urgency ? <span className={`admin-chip is-${row.urgency}`}>{d.urgency[row.urgency]}</span> : <span />}
      <span
        className="admin-rating"
        aria-label={row.rating ? d.rating[row.rating === 'liked' ? 'likedLabel' : 'dislikedLabel'] : t.noRating}
      >
        {row.rating ? d.rating[row.rating] : '—'}
      </span>
    </>
  )
}
