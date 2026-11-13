/**
 * Searching the «Можно ли» reference, the same way on the server, on the
 * phone and on the site hub (docs/superpowers/specs/2026-11-13-pet-safety-design.md,
 * «Поиск»). Word forms are covered by each entry's aliases, not by morphology:
 * a predictable miss that falls through to the AI answer beats a clever match
 * that lands on the wrong entry.
 */

// Declared here until the contract owns them (SAFE-02), then imported from @lapka/contracts.
export type SafetyCategory = 'food' | 'plant' | 'medicine' | 'household'
export type SafetyVerdict = 'safe' | 'caution' | 'danger'

export type SafetyIndexItem = {
  slug: string
  category: SafetyCategory
  name: string
  aliases: string[]
  verdict: { cat: SafetyVerdict; dog: SafetyVerdict }
}

export const SAFETY_QUERY_MAX = 80
export const SAFETY_SUGGESTIONS_MAX = 8

/** A typo is forgiven only in a word this long: «рис» and «рос» are different foods. */
const TYPO_MIN_LENGTH = 5

/** Lower case, «ё» as «е», punctuation as spaces, single spaces, at most 80 characters. */
export function normalizeSafetyQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, SAFETY_QUERY_MAX)
    .trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * The same words but one, and that one at most one edit away and at least
 * five letters long in the query.
 */
function isTypoOf(query: string, term: string): boolean {
  const queryWords = query.split(' ')
  const termWords = term.split(' ')
  if (queryWords.length !== termWords.length) return false
  const differing = queryWords.flatMap((word, i) => (word === termWords[i] ? [] : [[word, termWords[i]]]))
  if (differing.length !== 1) return false
  const [word, target] = differing[0]
  return word.length >= TYPO_MIN_LENGTH && levenshtein(word, target) === 1
}

/** Whether a word of `term` (or a run of words) starts with the query. */
function startsAWord(term: string, query: string): boolean {
  return term.startsWith(query) || term.includes(` ${query}`)
}

type Group = 0 | 1 | 2 | 3

function groupOf(name: string, aliases: readonly string[], query: string): Group | null {
  if (name === query || aliases.includes(query)) return 0
  if (startsAWord(name, query)) return 1
  if (aliases.some(alias => startsAWord(alias, query))) return 2
  if (name.includes(query) || aliases.some(alias => alias.includes(query))) return 3
  return null
}

/**
 * `exact` is the entry the query names (by name, alias or a one-letter typo);
 * `suggestions` are what to show while typing: exact first, then a name that
 * starts with the query, an alias that does, and anything containing it; by
 * name inside each group.
 */
export function matchSafety(
  index: readonly SafetyIndexItem[],
  query: string,
): { exact: SafetyIndexItem | null; suggestions: SafetyIndexItem[] } {
  const q = normalizeSafetyQuery(query)
  if (!q) return { exact: null, suggestions: [] }

  const terms = index.map(item => ({
    item,
    name: normalizeSafetyQuery(item.name),
    aliases: item.aliases.map(normalizeSafetyQuery),
  }))
  const byName = (a: SafetyIndexItem, b: SafetyIndexItem) => a.name.localeCompare(b.name)

  const exact =
    terms.find(t => t.name === q || t.aliases.includes(q))?.item ??
    terms
      .filter(t => [t.name, ...t.aliases].some(term => isTypoOf(q, term)))
      .map(t => t.item)
      .sort(byName)[0] ??
    null

  const grouped = terms
    .map(t => ({ item: t.item, group: t.item === exact ? 0 : groupOf(t.name, t.aliases, q) }))
    .filter((entry): entry is { item: SafetyIndexItem; group: Group } => entry.group !== null)
    .sort((a, b) => a.group - b.group || byName(a.item, b.item))

  return { exact, suggestions: grouped.slice(0, SAFETY_SUGGESTIONS_MAX).map(entry => entry.item) }
}
