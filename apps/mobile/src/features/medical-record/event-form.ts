import {
  HEALTH_EVENT_LIMITS,
  type CompleteItemInput,
  type HealthEvent,
  type HealthEventInput,
  type HealthEventPatch,
  type HealthProduct,
  type HealthTarget,
} from '@lapka/contracts'
import {
  addInterval,
  eventPatchItems,
  eventProblems,
  nextDayProblem,
  productName,
  readEventInput,
  suggestNextDay,
  suggestionInterval,
  toggleParasiteGroup,
  type EventFields,
  type EventTextField,
  type Interval,
  type SupportedLocale,
} from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { dayInput, localToday, parseDayText } from '@/lib/calendar-day'
import { saveSummary } from './due'

/**
 * The record form — vaccinations and treatments — as text fields, and turning it into a request. No
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
  kind: HealthEvent['kind']
  /** Set for an item that already exists: the server updates it instead of adding one. */
  id?: string
  name: string
  targets: HealthTarget[]
  next: NextChoice
  nextText: string
  source: ItemSource
  productId: string | null
  /** The product's repeat interval; a year when there is none. */
  interval: Interval | null
}

export type EventDraft = {
  kind: HealthEvent['kind']
  status: 'done' | 'planned'
  date: string
  items: ItemDraft[]
  clinic: string
  notes: string
}

/** new: a record and its plans; edit: an existing record, no next dates; complete: «Сделано» on one plan. */
export type FormMode = 'new' | 'edit' | 'complete'

export function blankItem(key: string, kind: HealthEvent['kind'] = 'vaccination'): ItemDraft {
  return { key, kind, name: '', targets: [], next: 'year', nextText: '', source: 'unset', productId: null, interval: null }
}

/**
 * A parasite chip is a group — блохи, клещи, глисты. Turning it off removes
 * every code in the group (a picked product's ear mites go with ticks);
 * turning it on adds the group's own code.
 */
export function toggleGroup(item: ItemDraft, group: 'fleas' | 'ticks' | 'worms'): ItemDraft {
  return withTargets(item, toggleParasiteGroup(item.targets, group))
}

/** A vaccine chip turned on or off. */
export function toggleTarget(item: ItemDraft, code: HealthTarget): ItemDraft {
  return withTargets(
    item,
    item.targets.includes(code) ? item.targets.filter((other) => other !== code) : [...item.targets, code],
  )
}

/**
 * New «от чего» for an item. A product picked from the catalogue has a fixed
 * composition: once the diseases or parasites no longer match it, it is not
 * that product any more, so it is let go — the chips stay as set, and the
 * field is empty for another product or none. A name typed by hand is the
 * owner's own and stays.
 */
function withTargets(item: ItemDraft, targets: HealthTarget[]): ItemDraft {
  if (item.source !== 'catalog') return { ...item, targets }
  return { ...item, targets, name: '', productId: null, interval: null, source: 'unset' }
}

/**
 * A product picked from the catalogue replaces everything the item said —
 * name, diseases, interval — and the next date follows its interval again.
 * The name is the one the reader was shown: «Nobivac Tricat Trio» in English.
 */
export function pickProduct(item: ItemDraft, product: HealthProduct, locale: SupportedLocale): ItemDraft {
  return {
    ...item,
    name: productName(product, locale),
    targets: product.targets as HealthTarget[],
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

/**
 * The interval «suggested» next dates use: the product's, else a year for a
 * vaccine, a month or three for a treatment — the rule the site uses too
 * (shared `suggestionInterval`, MW-09).
 */
export function itemInterval(item: ItemDraft): Interval {
  return suggestionInterval(item.kind, item.interval, item.targets)
}

export function blankDraft(
  status: 'done' | 'planned',
  now: Date = new Date(),
  kind: HealthEvent['kind'] = 'vaccination',
): EventDraft {
  return { kind, status, date: status === 'done' ? dayInput(localToday(now)) : '', items: [], clinic: '', notes: '' }
}

export function draftFromEvent(event: HealthEvent): EventDraft {
  return {
    kind: event.kind,
    status: event.status,
    date: dayInput(event.date),
    items: event.items.map((item) => ({
      key: item.id,
      kind: event.kind,
      id: item.id,
      name: item.name ?? '',
      targets: item.targets as HealthTarget[],
      next: 'year',
      nextText: '',
      source: item.product_id ? 'catalog' : item.name ? 'manual' : 'none',
      productId: item.product_id,
      interval: item.interval,
    })),
    clinic: event.clinic ?? '',
    notes: event.notes ?? '',
  }
}

/**
 * Whether the form says that a done record cannot be changed afterwards: a
 * new done record, and «Сделано» on a plan — the first save of something
 * done (implementation-handoff, «Окончательное правило»). A plan being moved
 * stays a plan, so it does not.
 */
export function warnsDoneIsFinal(mode: FormMode, status: EventDraft['status']): boolean {
  return mode === 'complete' || (mode === 'new' && status === 'done')
}

export function draftChanged(before: EventDraft, after: EventDraft): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}

export type DraftErrors = {
  date?: string
  form?: string
  items?: Record<string, string>
  next?: Record<string, string>
} & Partial<Record<EventTextField, string>>

/** Whether «+ Ещё вакцина / препарат» may add one more: a record keeps the contract's number of items. */
export function canAddItem(draft: Pick<EventDraft, 'items'>): boolean {
  return draft.items.length < HEALTH_EVENT_LIMITS.items
}

type ItemInput = {
  id?: string
  name: string | null
  targets: HealthTarget[]
  product_id: string | null
  next_on: string | null
}

/**
 * What a save put in the future, for «Напомнить о бешенстве?» (spec §7.19):
 * the plan itself, or the first next date a done record set. Null if nothing.
 */
export function plannedItem(value: {
  kind: HealthEvent['kind']
  status: HealthEvent['status']
  items: readonly Pick<ItemInput, 'name' | 'targets' | 'next_on'>[]
}): { kind: HealthEvent['kind']; name: string | null; targets: string[] } | null {
  const item = value.status === 'planned' ? value.items[0] : value.items.find((candidate) => candidate.next_on !== null)
  return item ? { kind: value.kind, name: item.name, targets: [...item.targets] } : null
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
  if (item.next === 'year') return suggestNextDay(recordDay, itemInterval(item), today)
  const day = parseDayText(item.nextText)
  // The rule is shared with the site: after the record's day, not in the past.
  return day !== null && nextDayProblem(day, recordDay, today) === null ? day : undefined
}

/** «24.09.2026» as the shared reader takes it: a day, '' for none, or the text as typed (not a day). */
const typedDay = (text: string) => (text.trim() === '' ? '' : (parseDayText(text) ?? text.trim()))

/**
 * The form as the shared reader takes it: the typed day as a day, each
 * item's next-date choice as a day ('' for none; a custom day that is not
 * after the record's, or no day at all, is left as typed so the reader
 * names it).
 */
function fieldsOf(draft: EventDraft, withNext: boolean, today: string): EventFields {
  const date = typedDay(draft.date)
  return {
    // A visit is saved by its own form; `readDraft` refuses it before this.
    kind: draft.kind as EventFields['kind'],
    status: draft.status,
    date,
    clinic: draft.clinic,
    notes: draft.notes,
    items: draft.items.map((item) => {
      let next = ''
      if (withNext) {
        // «Через год» from a record day that is one; from a day that is not, nothing is suggested.
        if (item.next === 'year') next = (/^\d{4}-\d{2}-\d{2}$/.test(date) ? suggestNextDay(date, itemInterval(item), today) : null) ?? ''
        else if (item.next === 'custom') next = typedDay(item.nextText) || 'invalid'
      }
      return { key: item.key, id: item.id, name: item.name, targets: item.targets, productId: item.productId, next }
    }),
  }
}

/**
 * @param keptDate the record's current day when editing: an overdue plan may
 * keep it — only a new day has to be ahead (MR-03.3).
 *
 * What is wrong, and the body, are the shared reader's (`eventProblems`,
 * `readEventInput`, the site's too); this only says the codes in the app's
 * words. A new record is also checked against the contract before it is
 * sent, as the site checks it.
 */
export function readDraft(
  t: Dictionary,
  draft: EventDraft,
  mode: FormMode,
  now: Date = new Date(),
  keptDate?: string,
): ReadDraft {
  if (draft.kind === 'visit') throw new Error('a visit is saved by the visit form')
  const words = t.medicalRecord
  const errors: DraftErrors = {}
  const today = localToday(now)
  const withNext = mode !== 'edit'
  const fields = fieldsOf(draft, withNext, today)
  const options = { keptDate: keptDate ?? null, withNext }
  const problems = eventProblems(fields, today, options)
  const treatment = draft.kind === 'parasite'

  if (problems.date) errors.date = draft.status === 'done' ? words.dateInvalid : words.plannedDateInvalid
  if (problems.items === 'none') errors.form = treatment ? words.productsRequired : words.itemsRequired
  else if (problems.items === 'tooMany') errors.form = words.eventItemsFull(HEALTH_EVENT_LIMITS.items)
  for (const [key, found] of Object.entries(problems.item ?? {})) {
    if (found.empty) (errors.items ??= {})[key] = treatment ? words.itemEmptyTreatment : words.itemEmpty
    else if (found.name === 'tooLong') (errors.items ??= {})[key] = words.tooLong(HEALTH_EVENT_LIMITS.itemName)
    if (found.next) (errors.next ??= {})[key] = words.nextInvalid
  }
  for (const field of ['clinic', 'notes'] as const) if (problems[field]) errors[field] = words.tooLong(HEALTH_EVENT_LIMITS[field])
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  // A new record goes through the contract's schema too; a correction is
  // sent as a patch (`changeHealthEvent`), checked by the server.
  if (mode !== 'edit') {
    const read = readEventInput(fields, today, options)
    if (!read.ok) return { ok: false, errors: { form: words.saveEventFailed } }
  }
  const items: ItemInput[] = eventPatchItems(fields).map((item, index) => ({
    ...(item.id ? { id: item.id } : {}),
    name: item.name ?? null,
    targets: item.targets,
    product_id: item.product_id ?? null,
    next_on: withNext && draft.status === 'done' && fields.items[index].next !== '' ? fields.items[index].next : null,
  }))
  return {
    ok: true,
    value: {
      kind: draft.kind,
      status: draft.status,
      date: fields.date,
      clinic: draft.clinic.trim() === '' ? null : draft.clinic.trim(),
      notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
      items,
    },
  }
}

/**
 * How the form opens, from the pet's record: a new record of the kind the
 * address says, a plan to correct (its own day kept, MR-03.3), «Сделано» on
 * one planned item, or — for something done — locked, since history is read
 * and deleted, never corrected (owner rule of 26 September 2026; the server
 * refuses it as record_done). Null when the record or the item is not there.
 */
export type FormStart =
  | { state: 'locked'; kind: HealthEvent['kind'] }
  | {
      state: 'open'
      kind: HealthEvent['kind']
      draft: EventDraft
      /** A plan being corrected: its current day, which it may keep while overdue. */
      keptDate?: string
      /** «Сделано»: the plan the item belongs to, and how many other items stay planned. */
      source?: { event: HealthEvent; others: number }
    }

export function formStart(
  events: readonly HealthEvent[],
  request: { mode: FormMode; kind: HealthEvent['kind'] | null; status?: string; eventId?: string; itemId?: string },
  now: Date = new Date(),
): FormStart | null {
  if (request.mode === 'new') {
    const kind = request.kind ?? 'vaccination'
    const draft = blankDraft(request.status === 'planned' ? 'planned' : 'done', now, kind)
    draft.items = [blankItem('new-0', kind)]
    return { state: 'open', kind, draft }
  }
  if (request.mode === 'edit') {
    const event = events.find((e) => e.id === request.eventId)
    if (!event) return null
    // The screen is named after the record itself, locked or not, whatever the address said.
    if (event.status === 'done') return { state: 'locked', kind: event.kind }
    return { state: 'open', kind: event.kind, draft: draftFromEvent(event), keptDate: event.date }
  }
  const event = events.find((e) => e.items.some((item) => item.id === request.itemId))
  const item = event?.items.find((i) => i.id === request.itemId)
  if (!event || !item) return null
  return {
    state: 'open',
    kind: event.kind,
    draft: {
      kind: event.kind,
      status: 'done',
      date: dayInput(localToday(now)),
      items: [{ ...draftFromEvent({ ...event, items: [item] }).items[0], next: 'year' }],
      // Both start as the plan's own: what the fields hold is what the done
      // record gets, and a field emptied here clears the plan's text.
      clinic: event.clinic ?? '',
      notes: event.notes ?? '',
    },
    source: { event, others: event.items.length - 1 },
  }
}

type ReadValue = Extract<ReadDraft, { ok: true }>['value']

/** «Сделано» on one planned item, as sent. */
export function completionRequest(value: ReadValue, itemId: string): { itemId: string; input: CompleteItemInput } {
  return {
    itemId,
    input: {
      done_on: value.date,
      next_on: value.items[0]?.next_on ?? null,
      // '' is "sent empty" and clears the plan's text; null would keep
      // it (the contract's rule since MW-09, CompleteItemInputSchema).
      clinic: value.clinic ?? '',
      notes: value.notes ?? '',
    },
  }
}

/** A plan corrected, as sent: no next dates, and its day only when it moved. */
export function eventPatch(value: ReadValue, keptDate: string | undefined): HealthEventPatch {
  return {
    // Only a new day: an overdue plan's own day would be refused as past.
    ...(value.date !== keptDate ? { date: value.date } : {}),
    clinic: value.clinic,
    notes: value.notes,
    items: value.items.map(({ id, name, targets, product_id }) => ({ ...(id ? { id } : {}), name, targets, product_id })),
  }
}

/**
 * «Следующая»: the suggested day by the item's interval — or that it has
 * passed for an old record, or a dash before the record has a day — a day of
 * one's own, or none.
 */
export function nextChoices(
  t: Dictionary,
  item: ItemDraft,
  recordDay: string | null,
  today: string = localToday(),
): Array<{ value: NextChoice; label: string }> {
  const words = t.medicalRecord
  const interval = itemInterval(item)
  const spoken = words.catalog.interval[interval.unit](interval.value)
  const suggested = recordDay ? addInterval(recordDay, interval) : null
  return [
    {
      value: 'year',
      label: !suggested
        ? words.catalog.nextIn(spoken, '—')
        : suggested >= today
          ? words.catalog.nextIn(spoken, t.day(suggested, true))
          : words.nextPassed,
    },
    { value: 'custom', label: words.nextCustom },
    { value: 'none', label: words.nextNone },
  ]
}

/**
 * The note above «Сохранить» on a done record: what it plans next. Marking
 * one item of a plan says what becomes of the rest, in the same words
 * (FB-1/02). Nothing for a plan, a correction, or a day not yet typed.
 */
export function formSummary(
  t: Dictionary,
  form: { draft: EventDraft; mode: FormMode; recordDay: string | null; others: number },
  today: string = localToday(),
): string | null {
  const { draft, mode, recordDay } = form
  if (mode === 'edit' || draft.status !== 'done' || !recordDay) return null
  const days = draft.items.map((item) => nextDate(item, recordDay, today) ?? null)
  const done = saveSummary(t, days, today)
  const others = mode === 'complete' ? form.others : 0
  return others > 0 ? `${done} ${t.medicalRecord.summaryComplete(others)}` : done
}
