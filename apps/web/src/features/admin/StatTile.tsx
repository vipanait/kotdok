'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminChange } from './change'
import { formatNumber } from './format'

/** One figure with how it moved against the previous period, and an optional note under it. */
export default function StatTile({
  label,
  value,
  change,
  note,
}: {
  label: string
  value: string
  change?: AdminChange
  note?: string
}) {
  const locale = useLocale()
  const t = useTranslations().admin.dashboard.change

  let line: string | null = null
  let tone = 'flat'
  if (change) {
    if (change.kind === 'new') line = t.new
    else if (change.kind === 'nodata') line = t.nodata
    else if (change.kind === 'flat') line = `— ${t.flat}`
    else {
      tone = change.kind
      const amount = formatNumber(change.value, locale)
      const unit = change.unit === 'percent' ? `${amount}%` : change.unit === 'points' ? `${amount} ${t.points}` : amount
      line = `${change.kind === 'up' ? '▲' : '▼'} ${unit}`
    }
  }

  return (
    <div className="card stat admin-tile">
      <span className="small muted">{label}</span>
      <strong>{value}</strong>
      {line && <span className={`admin-tile-change is-${tone}`}>{line}</span>}
      {note && <span className="admin-tile-note small muted">{note}</span>}
    </div>
  )
}
