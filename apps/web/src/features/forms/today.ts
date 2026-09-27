import { localToday } from '@lapka/shared'

/**
 * When the owner's day turns over, as plain arithmetic apart from React so
 * it is unit tested (`useToday` is the hook around it).
 */

/** The longest wait between two looks at the clock: a sleeping laptop's timers fire late, a changed clock not at all. */
export const DAY_CHECK_MAX_MS = 60_000

/** Milliseconds from `now` to the next local midnight, and a moment past it. */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 250)
  return Math.max(0, next.getTime() - now.getTime())
}

/** How long to wait before looking at the clock again: to just past midnight, and never more than a minute. */
export function nextDayCheckDelay(now: Date): number {
  return Math.min(msUntilNextDay(now), DAY_CHECK_MAX_MS)
}

/**
 * The day a page shows after another look at the clock. `shown` is the page's
 * today (the server's owner day at first); `seen` the browser's own day the
 * last time it looked. Only a change of the browser's day moves the page —
 * so a page drawn with the owner's zone is not moved to another zone's day
 * the first time it looks — and then to the browser's new day.
 */
export function dayAfterLook(shown: string, seen: string, now: Date = new Date()): { shown: string; seen: string } {
  const current = localToday(now)
  if (current === seen) return { shown, seen }
  return { shown: current, seen: current }
}
