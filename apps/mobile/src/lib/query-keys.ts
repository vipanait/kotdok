/**
 * The keys the screens read the server's answers under, in one place.
 *
 * A key names a resource, not a screen: every screen that shows a pet's
 * record reads `overview(petId)`, so one answer serves them all and one
 * invalidation after a save reaches them all. Keys are scoped to the
 * signed-in user by `scoped` before they reach the cache, so nothing one
 * account loaded can be read back under another.
 */

export type CacheKey = readonly unknown[]

export const queryKeys = {
  pets: () => ['pets'] as const,
  due: () => ['due'] as const,
  me: () => ['me'] as const,
  overview: (petId: string) => ['overview', petId] as const,
  /** The doses of one day, or of a span of days. */
  doses: (petId: string, from: string, to: string = from) => (from === to ? (['doses', petId, from] as const) : (['doses', petId, from, to] as const)),
  /** `limit` only when a screen asks for a page of its own size: the same list, a longer page. */
  checks: (petId: string | null, limit?: number) => (limit === undefined ? (['checks', petId ?? 'all'] as const) : (['checks', petId ?? 'all', limit] as const)),
  check: (checkId: string) => ['check', checkId] as const,
  /** Every list of checks, whatever the pet or the page size: a check sent moves them all. */
  allChecks: () => ['checks'] as const,
  /** «Для врача», counted on the owner's day. */
  summary: (petId: string, today: string) => ['summary', petId, today] as const,
  followups: () => ['followups'] as const,
  followup: (caseId: string) => ['followup', caseId] as const,
  checkFollowup: (checkId: string) => ['check-followup', checkId] as const,
  episodes: (petId: string) => ['episodes', petId] as const,
}

/** The key as the cache holds it: this user's. */
export function scoped(userId: string, key: CacheKey): unknown[] {
  return [userId, ...key]
}

/**
 * What outlives a restart: the lists and the records, which the first screen
 * after a launch draws from. Not the checks — each carries the model's whole
 * answer — nor the doses and summaries, which are a day's reading.
 */
export const PERSISTED: ReadonlySet<string> = new Set(['pets', 'due', 'me', 'overview', 'followups'])

export function persisted(queryKey: CacheKey): boolean {
  return typeof queryKey[1] === 'string' && PERSISTED.has(queryKey[1])
}

/**
 * Everything a change to a pet's record can move: the record, its doses and
 * its summary, and the two lists that carry a line per pet. Without a pet
 * (a pet added or removed), every record.
 */
export function recordKeys(petId: string | null): CacheKey[] {
  const own: CacheKey[] = petId ? [['overview', petId], ['doses', petId], ['summary', petId], ['episodes', petId]] : [['overview'], ['doses'], ['summary'], ['episodes']]
  return [...own, ['due'], ['pets']]
}
