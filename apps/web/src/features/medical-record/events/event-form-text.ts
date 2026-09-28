import { CalendarDateSchema, HEALTH_EVENT_LIMITS, type HealthEvent } from '@lapka/contracts'
import { suggestNextDay, suggestionInterval, type Interval } from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import type { EventFormKind, EventProblems, EventSaveFailure, ItemProblems } from './event-form'

/**
 * The event form's words for what is wrong, apart from React so they are
 * unit tested. The limits in the sentences are the contract's.
 */

export type ItemErrorTexts = { name?: string; targets?: string; next?: string }

export type EventErrorTexts = {
  date?: string
  items?: string
  item: Record<string, ItemErrorTexts>
  clinic?: string
  notes?: string
}

function itemTexts(dict: Dictionary, kind: EventFormKind, problems: ItemProblems): ItemErrorTexts {
  const errors = dict.medicalRecord.eventForm.errors
  return {
    name:
      problems.name === 'empty'
        ? errors.nameEmpty
        : problems.name === 'tooLong'
          ? errors.nameTooLong.replace('{max}', String(HEALTH_EVENT_LIMITS.itemName))
          : undefined,
    targets: problems.targets ? dict.medicalRecord.eventForm[kind].targetsEmpty : undefined,
    next:
      problems.next === 'invalid'
        ? errors.dayInvalid
        : problems.next === 'notAfter'
          ? errors.nextNotAfter
          : problems.next === 'past'
            ? errors.nextPast
            : undefined,
  }
}

export function eventErrorTexts(dict: Dictionary, kind: EventFormKind, problems: EventProblems): EventErrorTexts {
  const errors = dict.medicalRecord.eventForm.errors
  return {
    date:
      problems.date === 'empty'
        ? errors.dayEmpty
        : problems.date === 'invalid'
          ? errors.dayInvalid
          : problems.date === 'future'
            ? errors.dayFuture
            : problems.date === 'past'
              ? errors.dayPast
              : undefined,
    items:
      problems.items === 'none'
        ? dict.medicalRecord.eventForm[kind].itemsNone
        : problems.items === 'tooMany'
          ? errors.itemsTooMany.replace('{max}', String(HEALTH_EVENT_LIMITS.items))
          : undefined,
    item: Object.fromEntries(Object.entries(problems.item ?? {}).map(([key, found]) => [key, itemTexts(dict, kind, found)])),
    clinic: problems.clinic ? errors.clinicTooLong.replace('{max}', String(HEALTH_EVENT_LIMITS.clinic)) : undefined,
    notes: problems.notes ? errors.notesTooLong.replace('{max}', String(HEALTH_EVENT_LIMITS.notes)) : undefined,
  }
}

/** The banner above the form for a failed save. */
export function eventFailureText(dict: Dictionary, failure: Exclude<EventSaveFailure, 'deleting'>): string {
  return dict.medicalRecord.eventForm.errors[failure]
}

/**
 * Under an item's next date: what the interval is — the product's, in its
 * own unit («12 недель», not «3 месяца»), or the usual one for the kind
 * (shared `suggestionInterval`, the phone's rule). It says «Предложено…»
 * only while the field holds the date the interval suggested (MW-09): not
 * once the owner cleared or changed it, and not when the interval lands in
 * the past and nothing was put there. With no readable record day yet, only
 * that the date can be changed.
 */
export function nextHintText(
  dict: Dictionary,
  locale: Locale,
  kind: HealthEvent['kind'],
  item: { interval: Interval | null; targets: readonly string[] },
  recordDay: string,
  next: string,
  today: string,
): string {
  const form = dict.medicalRecord.eventForm
  if (!CalendarDateSchema.safeParse(recordDay).success) return form.nextHint
  const interval = suggestionInterval(kind, item.interval, item.targets)
  const spoken = formatCount(form.interval[interval.unit], interval.value, locale)
  const suggestion = suggestNextDay(recordDay, interval, today)
  if (suggestion === null) return form.nextNotSuggested.replace('{interval}', spoken)
  const own = item.interval !== null
  const why =
    next === suggestion
      ? (own ? form.nextSuggested : form.nextSuggestedUsual)
      : (own ? form.nextInterval : form.nextIntervalUsual)
  return `${why.replace('{interval}', spoken)} ${form.nextHint}`
}
