'use client'

import Link from 'next/link'
import { useId, useState, useSyncExternalStore, type ReactNode } from 'react'
import { SAFETY_CATEGORIES, type SafetyCategory, type SafetyIndexItem } from '@lapka/contracts'
import { safetyCategoryIcon } from '@lapka/shared'
import { SIGN_UP_HREF } from '@/features/seo-content/components/CheckCta'
import { safetyPath } from '@/shared/content-paths'
import { HUB_SEARCH_TITLE, hubSearch, hubSearching } from './hub-search'
import SafetyIcon from './SafetyIcon'
import { SafetyCardGrid, categoryAnchor } from './SafetyItemCard'
import { SAFETY_CATEGORY_TITLES } from './verdict'

const noSubscription = () => () => {}

const byName = (a: SafetyIndexItem, b: SafetyIndexItem) => a.name.localeCompare(b.name, 'ru')

/**
 * The hub's search box, its category chips and what they show, run in the
 * browser on the index the page was built with (no request, no session).
 *
 * The search is `hubSearch` — the same `matchSafety` the API and the phone
 * use (aliases, normalisation, typos, ranking) — over the entries of the
 * chosen category, so a chip and a query work together. While neither is
 * set the page shows «Часто спрашивают» and the whole catalogue by category
 * (`children`, rendered on the server), which is all there is before the
 * script runs and what a search engine follows: the field appears only once
 * it can search, and the chips are plain links to the catalogue's sections
 * until then. A filter hides the catalogue (still in the HTML) instead of
 * removing it.
 *
 * The page's heading (`hero`) is drawn here too: while a query is typed it
 * gives way to «Поиск по справочнику» alone — no lead, no picture — over the
 * same field and chips (handoff, «Уточнение: поиск…»). Before the script runs
 * nothing is typed, so the server's HTML carries the full heading.
 */
export default function SafetyHubSearch({
  hero,
  index,
  popular,
  children,
}: {
  /** The page's heading, title and lead with the picture; shown while nothing is typed. */
  hero: ReactNode
  index: SafetyIndexItem[]
  /** The «Часто спрашивают» entries, in order; slugs the index lacks are skipped. */
  popular: readonly string[]
  children?: ReactNode
}) {
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<SafetyCategory | null>(null)
  const inputId = useId()
  const resultsId = useId()

  const categories = SAFETY_CATEGORIES.filter(c => index.some(item => item.category === c))
  const scoped = category ? index.filter(item => item.category === category) : index
  const search = hubSearch(scoped, query)
  const filtering = hydrated && (search.state !== 'idle' || category !== null)
  const shown = search.state === 'found' ? search.items : search.state === 'idle' ? [...scoped].sort(byName) : []
  const searching = hydrated && hubSearching(query)
  const popularItems = popular.flatMap(slug => index.find(item => item.slug === slug) ?? [])

  return (
    <>
      {searching ? (
        <header className="safety-hero searching">
          <h1>{HUB_SEARCH_TITLE}</h1>
        </header>
      ) : (
        hero
      )}
      <section className="safety-searchbox" aria-label="Поиск по справочнику">
        {hydrated && (
          <form
            role="search"
            onSubmit={event => {
              event.preventDefault()
              // Enter goes to the entry the query names; anything vaguer stays on the list.
              const target = search.state === 'found' ? (search.exact ?? (search.items.length === 1 ? search.items[0] : null)) : null
              // A plain navigation: the entry page is a static file, and this keeps the field free of router state.
              if (target) window.location.assign(safetyPath(target.slug))
            }}
          >
            <label htmlFor={inputId} className="safety-sr">Что питомец съел или может съесть</label>
            <div className="safety-field">
              <svg className="safety-field-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6" />
                <path d="m15 15 5 5" />
              </svg>
              <input
                id={inputId}
                type="search"
                value={query}
                maxLength={80}
                autoComplete="off"
                placeholder="Виноград, лилия, ибупрофен"
                aria-controls={resultsId}
                onChange={event => setQuery(event.target.value)}
              />
              {query && (
                <button type="button" className="safety-clear" aria-label="Очистить поиск" onClick={() => setQuery('')}>
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
          </form>
        )}
        <div className="safety-chips" role={hydrated ? 'group' : undefined} aria-label="Категории">
          {hydrated ? (
            <>
              <button type="button" className="safety-chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
                Все
              </button>
              {categories.map(c => (
                <button key={c} type="button" className="safety-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                  <SafetyIcon name={safetyCategoryIcon(c)} size="chip" />
                  {SAFETY_CATEGORY_TITLES[c]}
                </button>
              ))}
            </>
          ) : (
            categories.map(c => (
              <a key={c} href={`#${categoryAnchor(c)}`} className="safety-chip">
                <SafetyIcon name={safetyCategoryIcon(c)} size="chip" />
                {SAFETY_CATEGORY_TITLES[c]}
              </a>
            ))
          )}
        </div>
      </section>

      <div id={resultsId}>
        {filtering && (
          <section aria-labelledby="results-title" className="safety-section">
            <div className="safety-sectionhead">
              <h2 id="results-title">{search.state === 'idle' && category ? SAFETY_CATEGORY_TITLES[category] : 'Результаты поиска'}</h2>
              {/* One live region; with nothing found the card below says it, so the line is for a screen reader only. */}
              <p className={shown.length > 0 ? 'safety-count' : 'safety-sr'} role="status">
                {shown.length > 0 ? `Найдено: ${shown.length}` : 'Ничего не нашли'}
              </p>
            </div>
            {shown.length > 0 ? (
              <SafetyCardGrid items={shown} />
            ) : (
              // Under the field, so the query is edited or cleared right there; the AI question is the app's.
              <div className="safety-state">
                <h3>Ничего не нашли</h3>
                <p>
                  Попробуйте другое название{category ? ' или поищите во всех категориях' : ''}. Чего нет
                  в справочнике, можно спросить ИИ в приложении: <Link href={SIGN_UP_HREF} className="link">зарегистрироваться</Link>
                </p>
                {category && (
                  <button type="button" className="btn primary" onClick={() => setCategory(null)}>Искать во всех категориях</button>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <div hidden={filtering}>
        {popularItems.length > 0 && (
          <section aria-labelledby="popular-title" className="safety-section">
            <div className="safety-sectionhead">
              <h2 id="popular-title">Часто спрашивают</h2>
              <a href="#catalogue" className="safety-count">Весь справочник <span aria-hidden="true">↓</span></a>
            </div>
            <SafetyCardGrid items={popularItems} />
          </section>
        )}
        {children}
      </div>
    </>
  )
}
