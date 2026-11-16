/**
 * What the «Можно ли?» search shows under its field, decided apart from the
 * drawing so the rules can be tested: the popular entries, one category, the
 * matches for what is typed (inside the chosen category, as on the site), or
 * nothing found — and then whether the other categories hold it.
 */

import type { SafetyCategory, SafetyIndexItem } from '@lapka/contracts'
import { matchSafety, normalizeSafetyQuery, safetyIconFor, type SafetyIconName } from '@lapka/shared'

/**
 * «Часто спрашивают» before anything is typed: what people most often ask
 * about first (the six /otravlenie topics among them), then the rest by name.
 * Slugs the index does not hold — not written yet, or not published — are
 * skipped, so the list is never a row short of a link.
 */
export const POPULAR_SLUGS = [
  'shokolad',
  'vinograd',
  'luk-chesnok',
  'ksilit',
  'liliya',
  'ibuprofen',
  'paracetamol',
  'antifriz',
  'moloko',
  'morkov',
  'yabloko',
  'hlorofitum',
  'avokado',
  'banan',
  'arbuz',
] as const

const POPULAR_SHOWN = 12

function popular(items: readonly SafetyIndexItem[]): SafetyIndexItem[] {
  const rank = (slug: string) => {
    const at = (POPULAR_SLUGS as readonly string[]).indexOf(slug)
    return at === -1 ? POPULAR_SLUGS.length : at
  }
  return [...items]
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name))
    .slice(0, POPULAR_SHOWN)
}

/** A row of the list: the entry and its picture — its own for a known slug, its category's otherwise. */
export type SafetyRow = { item: SafetyIndexItem; icon: SafetyIconName }

export type SafetySearchView =
  | { kind: 'loading' }
  /** Nothing published yet: the AI question stays open. */
  | { kind: 'emptyCatalogue' }
  | { kind: 'popular'; rows: SafetyRow[] }
  | { kind: 'category'; rows: SafetyRow[] }
  | { kind: 'results'; rows: SafetyRow[] }
  /** Nothing matches. `elsewhere`: the chosen category does not hold it, another one does. */
  | { kind: 'miss'; elsewhere: boolean }

const rows = (items: readonly SafetyIndexItem[]): SafetyRow[] =>
  items.map((item) => ({ item, icon: safetyIconFor(item.slug, item.category) }))

export function searchView(
  items: readonly SafetyIndexItem[] | null,
  query: string,
  category: SafetyCategory | null,
): SafetySearchView {
  if (items === null) return { kind: 'loading' }
  const typed = normalizeSafetyQuery(query).length > 0
  if (items.length === 0 && !typed) return { kind: 'emptyCatalogue' }

  const scoped = category ? items.filter((item) => item.category === category) : items
  if (!typed) {
    return category
      ? { kind: 'category', rows: rows([...scoped].sort((a, b) => a.name.localeCompare(b.name))) }
      : { kind: 'popular', rows: rows(popular(items)) }
  }

  const found = matchSafety(scoped, query).suggestions
  if (found.length > 0) return { kind: 'results', rows: rows(found) }
  const elsewhere = category !== null && matchSafety(items, query).suggestions.length > 0
  return { kind: 'miss', elsewhere }
}

/**
 * Whether the screen is searching: something that can be searched for is
 * typed. Then the heading says «Поиск по справочнику», the lead and the
 * recent queries step aside, and the pet picker and the field stay.
 */
export function isSearching(query: string): boolean {
  return normalizeSafetyQuery(query).length > 0
}

/** The recent queries under the field: hidden while a query is being typed. */
export function recentShown(query: string, recent: readonly string[]): readonly string[] {
  return isSearching(query) ? [] : recent
}

/** The tab's heading and lead: the screen's own name, or «Поиск по справочнику» without the lead while searching. */
export function homeHeading(
  t: { title: string; lead: string; searchTitle: string },
  query: string,
): { title: string; lead: string | null } {
  return isSearching(query) ? { title: t.searchTitle, lead: null } : { title: t.title, lead: t.lead }
}
