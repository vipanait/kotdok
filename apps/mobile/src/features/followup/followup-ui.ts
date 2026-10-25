import type { FollowupCaseSummary, FollowupSource, FollowupState } from '@lapka/contracts'
import { followupFireMoment } from '@lapka/shared'
import type { Dictionary } from '@/i18n'

/**
 * The follow-up loop on the phone (docs/plans/followup-loop): what the screens
 * share. The rule itself is the server's; nothing here decides an outcome.
 */

/** The phone's calendar day of a moment, `YYYY-MM-DD`. */
export function localDay(moment: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
}

function localTime(moment: Date): string {
  return `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`
}

/**
 * When the phone will actually ask: the question's moment, a night one moved
 * to 09:00 (`followupFireMoment`), worded as «завтра в 09:00».
 */
export function askWhen(t: Dictionary, dueAt: string, now: Date = new Date()): string {
  const fire = followupFireMoment(new Date(dueAt))
  const day = localDay(fire)
  const today = localDay(now)
  const tomorrow = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const relation = day === today ? 'today' : day === tomorrow ? 'tomorrow' : null
  return t.followup.at(day, localTime(fire), relation)
}

/** «23 октября» for a check's moment, on the phone's calendar. */
export function checkDay(t: Dictionary, iso: string): string {
  return t.day(localDay(new Date(iso)), false)
}

// «Скрыть до завтра» and which cases are due: shared with the site.
export { tomorrowMorning, isDue, dueCases as dueCards } from '@lapka/shared'

/** How a case reads in a list: its outcome, or that it is open (and whether a vet was advised). */
export function caseStatusWord(t: Dictionary, item: Pick<FollowupCaseSummary, 'status' | 'outcome' | 'escalation'>): string {
  if (item.status === 'closed' && item.outcome) return t.followup.status[item.outcome]
  return item.escalation === 'none' ? t.followup.status.active : t.followup.status.escalated
}

/**
 * Where a case's screens open in this tab: each tab has its own copy, so going
 * back returns to where the person came from.
 */
export function caseHref(
  tab: string | undefined,
  petId: string,
  caseId: string,
  screen: 'timeline' | 'checkin' = 'timeline',
  options: { state?: FollowupState; from?: FollowupSource } = {},
): string {
  const query = [options.state ? `state=${options.state}` : null, options.from ? `from=${options.from}` : null].filter(Boolean).join('&')
  const tail = screen === 'checkin' ? `/checkin${query ? `?${query}` : ''}` : ''
  if (tab === 'profile') return `/profile/case/${caseId}${tail}`
  if (tab === 'check') return `/check/case/${caseId}${tail}`
  return `/pets/${petId}/case/${caseId}${tail}`
}

/**
 * The history with one row per case: the newest check of a case stands for it,
 * its older checks are not repeated. Checks in no case stay as they were.
 */
export function oneRowPerCase<T extends { followup?: { case_id: string } | null }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const caseId = item.followup?.case_id
    if (!caseId) return true
    if (seen.has(caseId)) return false
    seen.add(caseId)
    return true
  })
}
