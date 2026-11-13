import type { CheckQuestionAlert, CheckQuestionThread, Urgency } from '@lapka/contracts'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import { formatDay, formatTime } from '@/features/followup/followup-view'

/**
 * What the questions block under a result says, apart from the component so
 * it can be tested without a DOM (CQ-02). The words are the check's language's.
 */

export type QuestionWords = Dictionary['checkQuestions']

/** Three ready questions for the level of the check (spec, «Экран»). */
export function suggestionsFor(urgency: Urgency, words: QuestionWords): string[] {
  const set =
    urgency === 'emergency' ? words.suggestions.emergency
      : urgency === 'urgent' ? words.suggestions.urgent
        : urgency === 'healthy' ? words.suggestions.healthy
          : words.suggestions.watch
  return [...set]
}

/** Whether a question may be asked now: places left and the window, on this clock, still open. */
export function isOpen(thread: CheckQuestionThread, now: Date): boolean {
  return thread.closed === null && thread.remaining > 0 && now.getTime() < new Date(thread.open_until).getTime()
}

/** Nothing to read and nothing to ask: the block is left out entirely. */
export function showsBlock(thread: CheckQuestionThread, now: Date): boolean {
  return thread.items.length > 0 || isOpen(thread, now)
}

/** «Осталось 2 вопроса из 3 · до 15 ноября, 14:20», or why no more are taken. */
export function threadNote(
  thread: CheckQuestionThread,
  now: Date,
  words: QuestionWords,
  locale: Locale,
  timeZone?: string,
): string {
  if (thread.closed === 'limit' || thread.remaining === 0) return words.closedLimit
  if (!isOpen(thread, now)) return words.closedExpired
  const count = formatCount(words.remaining, thread.remaining, locale).replace('{limit}', String(thread.limit))
  const when = `${formatDay(thread.open_until, locale, timeZone)}, ${formatTime(thread.open_until, locale, timeZone)}`
  return `${count} · ${words.until.replace('{when}', when)}`
}

/** The fixed words of the plate under an answer that raised an alert; null when there is none. */
export function alertText(alert: CheckQuestionAlert, petName: string | null, words: QuestionWords): string | null {
  if (alert === 'clinic_now') return words.alertNow
  if (alert === 'see_vet_today') return petName ? words.alertTodayNamed.replace('{name}', () => petName) : words.alertToday
  return null
}

/**
 * «Проверить снова» under an alarming answer: the open case's re-check, which
 * reads the previous check and these questions, or a new check of the pet.
 */
export function recheckHref(petId: string | null, followupCase: { id: string; status: string } | null): string {
  if (!petId) return '/check'
  if (followupCase?.status === 'active') return `/check?pet=${petId}&case=${followupCase.id}`
  return `/check?pet=${petId}`
}
