import type { HealthEvent, HealthEventInput, VaccineTarget } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { dayInput, localToday, parseDayInput, parseDayText, parseFutureDayInput } from '@/lib/calendar-day'
import { nextYear } from './due'

/**
 * The vaccination form as text fields, and turning it into a request. No
 * React here, so the rules of MR-03.3 run in the unit tests.
 */

export type NextChoice = 'year' | 'custom' | 'none'

export type ItemDraft = {
  /** Stable across renders, for React keys and error messages. */
  key: string
  /** Set for an item that already exists: the server updates it instead of adding one. */
  id?: string
  name: string
  targets: VaccineTarget[]
  next: NextChoice
  nextText: string
}

export type EventDraft = {
  status: 'done' | 'planned'
  date: string
  items: ItemDraft[]
  clinic: string
  notes: string
}

/** new: a record and its plans; edit: an existing record, no next dates; complete: «Сделано» on one plan. */
export type FormMode = 'new' | 'edit' | 'complete'

export function blankItem(key: string): ItemDraft {
  return { key, name: '', targets: [], next: 'year', nextText: '' }
}

export function blankDraft(status: 'done' | 'planned', now: Date = new Date()): EventDraft {
  return { status, date: status === 'done' ? dayInput(localToday(now)) : '', items: [], clinic: '', notes: '' }
}

export function draftFromEvent(event: HealthEvent): EventDraft {
  return {
    status: event.status,
    date: dayInput(event.date),
    items: event.items.map((item) => ({
      key: item.id,
      id: item.id,
      name: item.name ?? '',
      targets: item.targets as VaccineTarget[],
      next: 'year',
      nextText: '',
    })),
    clinic: event.clinic ?? '',
    notes: event.notes ?? '',
  }
}

export function draftChanged(before: EventDraft, after: EventDraft): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}

export type DraftErrors = {
  date?: string
  form?: string
  items?: Record<string, string>
  next?: Record<string, string>
}

type ItemInput = { id?: string; name: string | null; targets: VaccineTarget[]; next_on: string | null }

export type ReadDraft =
  | { ok: true; value: Omit<HealthEventInput, 'items'> & { items: ItemInput[] } }
  | { ok: false; errors: DraftErrors }

/** The next date an item's choice gives, or undefined when its custom date is not a later day. */
export function nextDate(item: ItemDraft, recordDay: string): string | null | undefined {
  if (item.next === 'none') return null
  if (item.next === 'year') return nextYear(recordDay)
  const day = parseDayText(item.nextText)
  return day !== null && day > recordDay ? day : undefined
}

/**
 * @param keptDate the record's current day when editing: an overdue plan may
 * keep it — only a new day has to be ahead (MR-03.3).
 */
export function readDraft(
  t: Dictionary,
  draft: EventDraft,
  mode: FormMode,
  now: Date = new Date(),
  keptDate?: string,
): ReadDraft {
  const words = t.medicalRecord
  const errors: DraftErrors = {}

  const unchanged = keptDate !== undefined && parseDayText(draft.date) === keptDate
  const date = unchanged
    ? keptDate
    : draft.status === 'done'
      ? parseDayInput(draft.date, now)
      : parseFutureDayInput(draft.date, now)
  if (!date) errors.date = draft.status === 'done' ? words.dateInvalid : words.plannedDateInvalid

  if (draft.items.length === 0) errors.form = words.itemsRequired

  const itemErrors: Record<string, string> = {}
  const nextErrors: Record<string, string> = {}
  const withNext = mode !== 'edit' && draft.status === 'done'

  const items = draft.items.map((item) => {
    const name = item.name.trim()
    if (name === '' && item.targets.length === 0) itemErrors[item.key] = words.itemEmpty
    let next_on: string | null = null
    if (withNext && date) {
      const next = nextDate(item, date)
      if (next === undefined) nextErrors[item.key] = words.nextInvalid
      else next_on = next
    }
    return { ...(item.id ? { id: item.id } : {}), name: name === '' ? null : name, targets: item.targets, next_on }
  })

  if (Object.keys(itemErrors).length > 0) errors.items = itemErrors
  if (Object.keys(nextErrors).length > 0) errors.next = nextErrors
  if (Object.keys(errors).length > 0 || !date) return { ok: false, errors }

  return {
    ok: true,
    value: {
      kind: 'vaccination',
      status: draft.status,
      date,
      clinic: draft.clinic.trim() === '' ? null : draft.clinic.trim(),
      notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
      items,
    },
  }
}
