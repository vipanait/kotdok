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
