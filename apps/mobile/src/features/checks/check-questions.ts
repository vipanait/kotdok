import type { CheckQuestionAlert, CheckQuestionThread, Urgency } from '@lapka/contracts'
import { formatDateTime } from '@lapka/shared'
import type { Dictionary } from '@/i18n'

/**
 * What the questions block under a result says (CQ-03), apart from the screen
 * so it can be tested. The words are the check's language's, as the rest of
 * the result. The site has the same rules over its own dictionary
 * (apps/web/src/features/symptom-check/check-questions-view.ts).
 */

export type QuestionWords = Dictionary['checkQuestions']

/** Three ready questions for the level of the check. */
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
  locale: string,
  timeZone?: string,
): string {
  if (thread.closed === 'limit' || thread.remaining === 0) return words.closedLimit
  if (!isOpen(thread, now)) return words.closedExpired
  const when = timeZone ? formatDateTime(thread.open_until, locale, { timeZone, year: false }) : onThisPhone(thread.open_until, locale)
  return `${words.remaining(thread.remaining, thread.limit)} · ${words.until(when)}`
}

/**
 * «15 ноября, 14:20» on the phone's own clock. The time is written by hand:
 * Hermes on the iOS 26 simulator gives `formatToParts` the day and the month
 * but no hour or minute, and `formatDateTime` then wrote «15 ноября, :».
 */
function onThisPhone(iso: string, locale: string): string {
  const moment = new Date(iso)
  const day = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long' }).format(moment)
  const hours = moment.getHours()
  const minutes = String(moment.getMinutes()).padStart(2, '0')
  if (locale === 'ru') return `${day}, ${String(hours).padStart(2, '0')}:${minutes}`
  return `${day}, ${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}

/**
 * What a 409 says once the thread has been read again: while it is open the
 * refusal can only be this very question still being answered, which will be
 * spent; a closed thread says why itself.
 */
export function conflictNotice(fresh: CheckQuestionThread | null, now: Date, words: QuestionWords): string | null {
  if (!fresh) return words.failed
  return isOpen(fresh, now) ? words.stillAnswering : null
}

/** The field once an answer came: emptied only if it still holds that question, not one typed meanwhile. */
export function clearedAfterAnswer(text: string, answered: string): string {
  return text.trim() === answered ? '' : text
}

/** The fixed words of the plate under an answer that raised an alert; null when there is none. */
export function alertText(alert: CheckQuestionAlert, petName: string | null, words: QuestionWords): string | null {
  if (alert === 'clinic_now') return words.alertNow
  if (alert === 'see_vet_today') return petName ? words.alertTodayNamed(petName) : words.alertToday
  return null
}
