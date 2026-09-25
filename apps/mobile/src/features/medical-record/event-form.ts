import type { HealthEvent, HealthEventInput, HealthProduct, VaccineTarget } from '@lapka/contracts'
import { addInterval, type Interval } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { dayInput, localToday, parseDayInput, parseDayText, parseFutureDayInput } from '@/lib/calendar-day'

/**
 * The vaccination form as text fields, and turning it into a request. No
 * React here, so the rules of MR-03.3 run in the unit tests.
 */

export type NextChoice = 'year' | 'custom' | 'none'

/**
 * How an item was named: picked from the catalogue, typed by hand, «Без
 * препарата» (diseases only), or not yet — a new item opens the catalogue.
 */
export type ItemSource = 'unset' | 'catalog' | 'manual' | 'none'

export type ItemDraft = {
  /** Stable across renders, for React keys and error messages. */
  key: string
  /** Set for an item that already exists: the server updates it instead of adding one. */
  id?: string
  name: string
  targets: VaccineTarget[]
  next: NextChoice
  nextText: string
  source: ItemSource
  productId: string | null
  /** The product's repeat interval; a year when there is none. */
  interval: Interval | null
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
  return { key, name: '', targets: [], next: 'year', nextText: '', source: 'unset', productId: null, interval: null }
}

/**
 * A product picked from the catalogue replaces everything the item said —
 * name, diseases, interval — and the next date follows its interval again.
 */
export function pickProduct(item: ItemDraft, product: HealthProduct): ItemDraft {
  return {
    ...item,
    name: product.name,
    targets: product.targets as VaccineTarget[],
    productId: product.id,
    interval: product.interval,
    source: 'catalog',
    next: 'year',
    nextText: '',
  }
}

/**
 * A name typed by hand is the owner's own: the item no longer claims to be the
 * catalogue product, and nothing typed is replaced by the catalogue's values.
 */
export function renameItem(item: ItemDraft, name: string): ItemDraft {
  return { ...item, name, productId: null, source: 'manual' }
}

/** The interval «suggested» next dates use: the product's, else a year. */
export function itemInterval(item: ItemDraft): Interval {
  return item.interval ?? { value: 1, unit: 'year' }
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
      source: item.product_id ? 'catalog' : item.name ? 'manual' : 'none',
      productId: item.product_id,
      interval: null,
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

type ItemInput = {
  id?: string
  name: string | null
  targets: VaccineTarget[]
  product_id: string | null
  next_on: string | null
}

export type ReadDraft =
  | { ok: true; value: Omit<HealthEventInput, 'items'> & { items: ItemInput[] } }
  | { ok: false; errors: DraftErrors }

/**
 * The next date an item's choice gives: null for none, undefined when a custom
 * date is not a later day that is still to come.
 *
 * «Через год» from a vaccination two years ago lands in the past: that plans
 * nothing, instead of filling backfilled history with overdue reminders.
 */
export function nextDate(item: ItemDraft, recordDay: string, today: string = localToday()): string | null | undefined {
  if (item.next === 'none') return null
  if (item.next === 'year') {
    const next = addInterval(recordDay, itemInterval(item))
    return next >= today ? next : null
  }
  const day = parseDayText(item.nextText)
  return day !== null && day > recordDay && day >= today ? day : undefined
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
      const next = nextDate(item, date, localToday(now))
      if (next === undefined) nextErrors[item.key] = words.nextInvalid
      else next_on = next
    }
    return {
      ...(item.id ? { id: item.id } : {}),
      name: name === '' ? null : name,
      targets: item.targets,
      product_id: item.productId,
      next_on,
    }
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
