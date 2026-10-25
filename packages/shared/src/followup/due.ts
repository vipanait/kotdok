import type { FollowupCaseSummary } from '@lapka/contracts'

// When a case is brought up — the pet list's cards, the site's banners — and
// «скрыть до завтра». Shared, so the phone and the site show the same cases.

/** Tomorrow at 09:00 on the caller's clock: «Скрыть до завтра». */
export function tomorrowMorning(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0)
}

/** A case whose question has come, and that was not hidden until later. */
export function isDue(item: Pick<FollowupCaseSummary, 'status' | 'next_due_at' | 'hidden_until'>, now: Date = new Date()): boolean {
  if (item.status !== 'active' || !item.next_due_at) return false
  if (item.hidden_until && new Date(item.hidden_until).getTime() > now.getTime()) return false
  return new Date(item.next_due_at).getTime() <= now.getTime()
}

/** The cases to bring up: one per pet, the earliest question first. */
export function dueCases(items: readonly FollowupCaseSummary[], now: Date = new Date()): FollowupCaseSummary[] {
  const seen = new Set<string>()
  return [...items]
    .filter((item) => isDue(item, now))
    .sort((a, b) => (a.next_due_at ?? '').localeCompare(b.next_due_at ?? ''))
    .filter((item) => (seen.has(item.pet_id) ? false : (seen.add(item.pet_id), true)))
}
