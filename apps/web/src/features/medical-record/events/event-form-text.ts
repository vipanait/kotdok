import { HEALTH_EVENT_LIMITS } from '@lapka/contracts'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
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
