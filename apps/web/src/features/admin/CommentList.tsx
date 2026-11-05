'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminFeedbackRow } from '@/shared/types/admin'
import { formatMoment } from './format'

/** Comments on answers, newest first. */
export default function CommentList({ rows }: { rows: AdminFeedbackRow[] }) {
  const locale = useLocale()
  const d = useTranslations().admin.dashboard

  if (rows.length === 0) return <p className="small muted">{d.overview.noComments}</p>

  return (
    <ul className="admin-comments">
      {rows.map(row => (
        <li key={row.id}>
          <span className="admin-rating" aria-label={d.rating[row.rating === 'liked' ? 'likedLabel' : 'dislikedLabel']}>
            {d.rating[row.rating]}
          </span>
          <span className="admin-comment-text">{row.comment}</span>
          <time className="small muted" dateTime={row.at}>{formatMoment(row.at, locale)}</time>
        </li>
      ))}
    </ul>
  )
}
