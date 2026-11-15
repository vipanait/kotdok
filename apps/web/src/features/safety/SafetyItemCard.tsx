import Link from 'next/link'
import type { SafetyCategory, SafetyIndexItem } from '@lapka/contracts'
import { safetyIconFor } from '@lapka/shared'
import { safetyPath } from '@/shared/content-paths'
import SafetyIcon from './SafetyIcon'
import { verdictView } from './verdict'

/**
 * One entry in a list of the hub (design v1, «Карточки»): the item picture,
 * the name, the cat's and the dog's verdict, and the way to the entry's
 * canonical page. The same card in the server-rendered catalogue and in the
 * search results, so it has no hooks and no client-only code.
 */
export default function SafetyItemCard({ item }: { item: Pick<SafetyIndexItem, 'slug' | 'name' | 'category' | 'verdict'> }) {
  return (
    <Link href={safetyPath(item.slug)} className="safety-card">
      <span className="safety-tile">
        <SafetyIcon name={safetyIconFor(item.slug, item.category)} />
      </span>
      <span className="safety-card-body">
        <strong className="safety-card-name">{item.name}</strong>
        <VerdictPair item={item} />
      </span>
      <span className="safety-card-chevron" aria-hidden="true">›</span>
    </Link>
  )
}

/** «Кошкам: Нельзя · Собакам: Нельзя» in the verdicts' colours; the colour always comes with the word. */
export function VerdictPair({ item }: { item: Pick<SafetyIndexItem, 'category' | 'verdict'> }) {
  return (
    <span className="verdict-pair">
      {(['cat', 'dog'] as const).map(species => {
        const view = verdictView(item.category, item.verdict[species])
        return (
          <span key={species} className={`badge ${view.tone}`}>
            {species === 'cat' ? 'Кошкам' : 'Собакам'}: {view.label}
          </span>
        )
      })}
    </span>
  )
}

/** The lists' grid: three columns on a wide screen, one on a phone. */
export function SafetyCardGrid({ items }: { items: readonly Pick<SafetyIndexItem, 'slug' | 'name' | 'category' | 'verdict'>[] }) {
  return (
    <ul className="safety-grid">
      {items.map(item => (
        <li key={item.slug}>
          <SafetyItemCard item={item} />
        </li>
      ))}
    </ul>
  )
}

/** Where a category chip leads before the script runs: its section of the catalogue. */
export const categoryAnchor = (category: SafetyCategory) => `safety-${category}`
