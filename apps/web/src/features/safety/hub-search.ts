import type { SafetyIndexItem } from '@lapka/contracts'
import { matchSafety, normalizeSafetyQuery } from '@lapka/shared'

/**
 * What the hub shows for what is typed: nothing yet, the entries found
 * (the one the query names first), or «not in the reference». The same
 * `matchSafety` the API and the phone search with, run in the browser on the
 * index the page was built with.
 */
export type HubSearch =
  | { state: 'idle' }
  | { state: 'found'; items: SafetyIndexItem[]; exact: SafetyIndexItem | null }
  | { state: 'missing' }

export function hubSearch(index: readonly SafetyIndexItem[], query: string): HubSearch {
  if (!normalizeSafetyQuery(query)) return { state: 'idle' }
  const { exact, suggestions } = matchSafety(index, query)
  return suggestions.length > 0 ? { state: 'found', items: suggestions, exact } : { state: 'missing' }
}

/** The hub's heading while a query is typed (handoff, «Уточнение: поиск, пустые результаты и ошибки»). */
export const HUB_SEARCH_TITLE = 'Поиск по справочнику'

/**
 * Whether the hub is searching: something that can be searched for is typed.
 * Then the heading becomes «Поиск по справочнику» and the lead and the picture
 * step aside; the field and the chips stay. A chip alone is browsing, not a search.
 */
export function hubSearching(query: string): boolean {
  return normalizeSafetyQuery(query).length > 0
}
