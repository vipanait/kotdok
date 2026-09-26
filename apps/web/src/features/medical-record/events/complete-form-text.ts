import { HEALTH_EVENT_LIMITS, type HealthItem } from '@lapka/contracts'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import { formatDay, recordDay } from '../view-model'
import type { CompleteDraft, CompleteProblems } from './complete-form'
import type { EventSaveFailure } from './event-form'

/**
 * The words of «Сделано», apart from React so they are unit tested: what
 * the save will do (this item only; the next date), why a field is refused,
 * why a save failed. The limits in the sentences are the contract's.
 */

export type CompleteErrorTexts = { doneOn?: string; next?: string; clinic?: string; notes?: string }

export function completeErrorTexts(dict: Dictionary, problems: CompleteProblems): CompleteErrorTexts {
  const errors = dict.medicalRecord.eventForm.errors
  return {
    doneOn:
      problems.doneOn === 'empty'
        ? errors.dayEmpty
        : problems.doneOn === 'invalid'
          ? errors.dayInvalid
          : problems.doneOn === 'future'
            ? errors.dayFuture
            : undefined,
    next:
      problems.next === 'invalid'
        ? errors.dayInvalid
        : problems.next === 'notAfter'
          ? errors.nextNotAfter
          : problems.next === 'past'
            ? errors.nextPast
            : undefined,
    clinic: problems.clinic ? errors.clinicTooLong.replace('{max}', String(HEALTH_EVENT_LIMITS.clinic)) : undefined,
    notes: problems.notes ? errors.notesTooLong.replace('{max}', String(HEALTH_EVENT_LIMITS.notes)) : undefined,
  }
}

/**
 * «Отметим только эту позицию: ещё 1 позиция останется в плане. Следующий
 * срок — 17 декабря.» — or, for a plan of one item, that the plan becomes
 * the done record.
 */
export function completionNote(dict: Dictionary, locale: Locale, others: number, draft: CompleteDraft, today: string): string {
  const words = dict.medicalRecord.completeForm
  const scope = others > 0 ? words.onlyThis.replace('{others}', formatCount(words.othersStay, others, locale)) : words.wholePlan
  const next = /^\d{4}-\d{2}-\d{2}$/.test(draft.next)
    ? words.nextNote.replace('{day}', recordDay(dict.medicalRecord, draft.next, today))
    : words.noNextNote
  return `${scope} ${next}`
}

/** Under the next date: which interval suggested it, in its own unit («12 недель», not «3 месяца»). */
export function nextHint(dict: Dictionary, locale: Locale, item: Pick<HealthItem, 'interval'>): string {
  const words = dict.medicalRecord.completeForm
  if (!item.interval) return words.nextNoInterval
  return words.nextSuggested.replace('{interval}', formatCount(words.interval[item.interval.unit], item.interval.value, locale))
}

/** «Было запланировано на 12 сентября 2026». */
export function planDayText(dict: Dictionary, day: string): string {
  return dict.medicalRecord.completeForm.planDay.replace('{day}', formatDay(dict.medicalRecord, day, true))
}

/** The banner for a failed «Сделано»; the form stays open with everything in it. */
export function completeFailureText(dict: Dictionary, failure: Exclude<EventSaveFailure, 'deleting'>): string {
  const own = dict.medicalRecord.completeForm.errors
  if (failure === 'alreadySaved' || failure === 'gone') return own[failure]
  return dict.medicalRecord.eventForm.errors[failure]
}
