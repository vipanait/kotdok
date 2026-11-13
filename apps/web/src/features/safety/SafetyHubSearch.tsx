'use client'

import Link from 'next/link'
import { useId, useState, useSyncExternalStore } from 'react'
import type { SafetyIndexItem } from '@lapka/contracts'
import { SIGN_UP_HREF } from '@/features/seo-content/components/CheckCta'
import { safetyPath } from '@/shared/content-paths'
import { hubSearch } from './hub-search'
import { verdictView } from './verdict'

const noSubscription = () => () => {}

/**
 * The hub's search, run in the browser on the index the page was built with
 * (no request, no session). It appears only once the script runs: before
 * that, or without JavaScript, a field that searches nothing would be a
 * broken promise, and the list of entries by category under it already
 * does the job.
 */
export default function SafetyHubSearch({ index }: { index: SafetyIndexItem[] }) {
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false)
  const [query, setQuery] = useState('')
  const inputId = useId()
  const resultsId = useId()

  if (!hydrated) return null
  const result = hubSearch(index, query)

  return (
    <form
      role="search"
      className="safety-search"
      onSubmit={event => {
        event.preventDefault()
        // Enter goes to the entry the query names; anything vaguer stays on the list.
        const target = result.state === 'found' ? (result.exact ?? (result.items.length === 1 ? result.items[0] : null)) : null
        // A plain navigation: the entry page is a static file, and this keeps the field free of router state.
        if (target) window.location.assign(safetyPath(target.slug))
      }}
    >
      <label htmlFor={inputId}>Что питомец съел или может съесть</label>
      <input
        id={inputId}
        type="search"
        className="input"
        value={query}
        maxLength={80}
        autoComplete="off"
        placeholder="Виноград, лилия, ибупрофен"
        aria-controls={resultsId}
        onChange={event => setQuery(event.target.value)}
      />
      <div id={resultsId} aria-live="polite">
        {result.state === 'found' && (
          <ul className="safety-results">
            {result.items.map(item => (
              <li key={item.slug}>
                <Link href={safetyPath(item.slug)} className="card hub-item">
                  <strong>{item.name}</strong>
                  <VerdictPair item={item} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {result.state === 'missing' && (
          <p className="safety-missing">
            Этого пока нет в справочнике. Спросить можно в приложении:{' '}
            <Link href={SIGN_UP_HREF} className="link">зарегистрироваться</Link>
          </p>
        )}
      </div>
    </form>
  )
}

/** «Кошкам: Нельзя · Собакам: Нельзя» in the verdicts' colours. */
export function VerdictPair({ item }: { item: Pick<SafetyIndexItem, 'category' | 'verdict'> }) {
  return (
    <span className="verdict-pair">
      {(['cat', 'dog'] as const).map(species => {
        const view = verdictView(item.category, item.verdict[species])
        return (
          <span key={species} className={`badge ${view.tone}`}>
            <i aria-hidden="true" />
            {species === 'cat' ? 'Кошкам' : 'Собакам'}: {view.label}
          </span>
        )
      })}
    </span>
  )
}
