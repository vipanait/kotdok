/**
 * How long an answer is shown without asking again: a screen left and come
 * back to within this shows what it showed, a save invalidates the keys it
 * moves (`recordKeys`), and anything older is read again on focus.
 */
export const STALE_MS = 30_000

/** The part of a query's state the rule reads. */
export type Freshness = { dataUpdatedAt: number; isInvalidated: boolean }

export function needsRefetch(state: Freshness | undefined, now: number): boolean {
  if (!state || state.dataUpdatedAt === 0) return true
  if (state.isInvalidated) return true
  return now - state.dataUpdatedAt >= STALE_MS
}
