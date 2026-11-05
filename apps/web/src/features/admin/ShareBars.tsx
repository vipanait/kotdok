'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { formatNumber, formatPercent } from './format'

export interface ShareItem {
  label: string
  count: number
}

/** Horizontal bars: each item's share of the total and its count, largest first. */
export default function ShareBars({ label, items }: { label: string; items: ShareItem[] }) {
  const locale = useLocale()
  const d = useTranslations().admin.dashboard
  const total = items.reduce((sum, item) => sum + item.count, 0)

  if (total === 0) return <p className="small muted">{d.noShares}</p>

  const sorted = [...items].sort((a, b) => b.count - a.count)
  return (
    <ul className="admin-shares" aria-label={label}>
      {sorted.map(item => {
        const share = item.count / total
        return (
          <li key={item.label}>
            <span className="admin-share-label">{item.label}</span>
            <span className="admin-share-bar" aria-hidden>
              <i style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            <span className="admin-share-value">{`${formatPercent(share, locale)} · ${formatNumber(item.count, locale)}`}</span>
          </li>
        )
      })}
    </ul>
  )
}
