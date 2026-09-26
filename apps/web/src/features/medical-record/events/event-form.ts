import {
  HEALTH_EVENT_LIMITS,
  HealthEventInputSchema,
  HealthEventPatchSchema,
  ParasiteTargetSchema,
  VaccineTargetSchema,
  type HealthEvent,
  type HealthEventInput,
  type HealthEventPatch,
  type HealthProduct,
  type HealthSection,
  type HealthTarget,
  type ProductKind,
} from '@lapka/contracts'
import {
  ApiError,
  ApiTimeoutError,
  eventDayProblem,
  nextDayProblem,
  suggestNextDay,
  type EventDayProblem,
  type Interval,
  type NextDayProblem,
} from '@lapka/shared'
import type { RecordType } from '../stage'

/**
 * The vaccination and treatment form (web v1 «vaccine-done», «vaccine-plan»,
 * «catalog», «manual», «targets»; MW-04 reuses it for treatments) as data,
 * apart from React so its rules are unit tested:
 *
 * - «Сделано» starts today, «Запланировать» with no day; switching keeps the
 *   items, and a plan has no next dates (they are kept aside, not lost);
 * - an item is a catalogue product (its name and diseases), the owner's own
 *   name, or «Без препарата» — diseases only, at least one;
 * - a catalogue interval only suggests the next date, the owner changes or
 *   clears it; the owner's own product gets no suggestion;
 * - a plan being corrected keeps its id, its day unless moved, and its items'
 *   ids; a done record is never corrected (owner rule of 26 September 2026).
 *
 * The contract's schemas have the last word before anything is sent.
 */

export type EventFormKind = HealthEventInput['kind']

/** Per kind: where it is listed, what the catalogue calls it, what «Добавить запись» calls it. */
export const EVENT_FORM_KINDS: Record<EventFormKind, { section: HealthSection; product: ProductKind; recordType: RecordType }> = {
  vaccination: { section: 'vaccinations', product: 'vaccine', recordType: 'vaccination' },
  parasite: { section: 'parasites', product: 'antiparasitic', recordType: 'parasite' },
}

/** How an item was named. */
export type ItemSource = 'catalog' | 'manual' | 'none'

export type ItemDraft = {
  /** Stable across renders and errors. */
  key: string
  /** An item the plan already has: the server keeps it. */
  id?: string
  source: ItemSource
  name: string
  manufacturer: string | null
  productId: string | null
  targets: HealthTarget[]
  interval: Interval | null
  /** «Следующая дата», done records only; '' is none. */
  next: string
  /** The owner set or cleared the next date: a new record day no longer moves it. */
  nextTouched: boolean
}

export type EventDraft = {
  kind: EventFormKind
  status: HealthEvent['status']
  /** yyyy-mm-dd, or '' before one is chosen. */
  date: string
  items: ItemDraft[]
  clinic: string
  notes: string
}

export function blankEventDraft(kind: EventFormKind, status: HealthEvent['status'], today: string): EventDraft {
  return { kind, status, date: status === 'done' ? today : '', items: [], clinic: '', notes: '' }
}

/** The plan being corrected, exactly as saved. */
export function draftFromPlan(event: HealthEvent): EventDraft {
  if (event.kind === 'visit') throw new Error('a visit has its own form')
  return {
    kind: event.kind,
    status: event.status,
    date: event.date,
    items: event.items.map((item) => ({
      key: item.id,
      id: item.id,
      source: item.product_id ? 'catalog' : item.name ? 'manual' : 'none',
      name: item.name ?? '',
      manufacturer: null,
      productId: item.product_id,
      targets: item.targets as HealthTarget[],
      interval: item.interval,
      next: '',
      nextTouched: false,
    })),
    clinic: event.clinic ?? '',
    notes: event.notes ?? '',
  }
}

/** A product picked from the catalogue: its name, diseases and interval; the next date follows it. */
export function productItem(key: string, product: HealthProduct, draft: EventDraft, today: string): ItemDraft {
  const fits = draft.kind === 'vaccination' ? VaccineTargetSchema : ParasiteTargetSchema
  return {
    key,
    source: 'catalog',
    name: product.name,
    manufacturer: product.manufacturer,
    productId: product.id,
    targets: product.targets.filter((code) => fits.safeParse(code).success) as HealthTarget[],
    interval: product.interval,
    next: draft.status === 'done' && draft.date ? (suggestNextDay(draft.date, product.interval, today) ?? '') : '',
    nextTouched: false,
  }
}

/** «Нет в списке — ввести название»: the owner's own name, no suggested date. */
export function manualItem(key: string, name: string): ItemDraft {
  return { key, source: 'manual', name, manufacturer: null, productId: null, targets: [], interval: null, next: '', nextTouched: false }
}

/** «Без препарата — только от чего»: diseases only. */
export function noProductItem(key: string): ItemDraft {
  return { key, source: 'none', name: '', manufacturer: null, productId: null, targets: [], interval: null, next: '', nextTouched: false }
}

/** Сделано ↔ Запланировать: the items stay; the day starts over (today for done, none for a plan). */
export function switchStatus(draft: EventDraft, status: HealthEvent['status'], today: string): EventDraft {
  if (draft.status === status) return draft
  const date = status === 'done' ? today : ''
  return {
    ...draft,
    status,
    date,
    items: draft.items.map((item) => (item.nextTouched ? item : { ...item, next: suggested(item, status, date, today) })),
  }
}

function suggested(item: ItemDraft, status: HealthEvent['status'], date: string, today: string): string {
  if (status !== 'done' || !date || item.source !== 'catalog') return ''
  return suggestNextDay(date, item.interval, today) ?? ''
}

/** A new record day moves the next dates the owner has not set by hand. */
export function changeDate(draft: EventDraft, date: string, today: string): EventDraft {
  return {
    ...draft,
    date,
    items: draft.items.map((item) => (item.nextTouched ? item : { ...item, next: suggested(item, draft.status, date, today) })),
  }
}

export function toggleTarget(item: ItemDraft, target: HealthTarget): ItemDraft {
  return {
    ...item,
    targets: item.targets.includes(target) ? item.targets.filter((code) => code !== target) : [...item.targets, target],
  }
}

// ---------- Reading the form ----------

/** The day rules are the shared ones (@lapka/shared `eventDayProblem`, `nextDayProblem`): the phone checks the same. */
export type DayProblem = EventDayProblem
export type ItemProblems = {
  name?: 'empty' | 'tooLong'
  targets?: 'empty'
  next?: NextDayProblem
}
export type EventProblems = {
  date?: DayProblem
  items?: 'none' | 'tooMany'
  item?: Record<string, ItemProblems>
  clinic?: 'tooLong'
  notes?: 'tooLong'
}

const trimmed = (text: string) => text.trim()
const orNull = (text: string) => (text.trim() === '' ? null : text.trim())

function itemProblems(item: ItemDraft, status: HealthEvent['status'], date: string, today: string): ItemProblems {
  const problems: ItemProblems = {}
  const name = trimmed(item.name)
  if (name.length > HEALTH_EVENT_LIMITS.itemName) problems.name = 'tooLong'
  // The owner chose to type a name: it is what the item is.
  if (item.source === 'manual' && name === '') problems.name = 'empty'
  // «Без препарата» says only what it was against: at least one disease (contract: a name or a disease).
  if (item.source === 'none' && item.targets.length === 0) problems.targets = 'empty'
  if (status === 'done' && item.next !== '') {
    const next = nextDayProblem(item.next, date || null, today)
    if (next) problems.next = next
  }
  return problems
}

/**
 * The contract refused a form the checks above let through: a mismatch
 * between this form and the schema, never the owner's typing. Shown like the
 * server's 400 («rejected»), never thrown out of the submit handler.
 */
export type ContractRefusal = { ok: false; rejected: true; problems: EventProblems }

export type ReadEvent =
  | { ok: true; input: HealthEventInput }
  | { ok: false; rejected?: false; problems: EventProblems }
  | ContractRefusal

export type ReadPlanChange =
  /** `patch` null: nothing changed. */
  | { ok: true; patch: HealthEventPatch | null }
  | { ok: false; rejected?: false; problems: EventProblems }
  | ContractRefusal

const refused: ContractRefusal = { ok: false, rejected: true, problems: {} }

function commonProblems(draft: EventDraft, today: string, keptDate: string | null): EventProblems {
  const problems: EventProblems = {}
  // An overdue plan may keep its own day; only a new day has to be ahead.
  const date = eventDayProblem(draft.date, draft.status, today, keptDate)
  if (date) problems.date = date

  if (draft.items.length === 0) problems.items = 'none'
  else if (draft.items.length > HEALTH_EVENT_LIMITS.items) problems.items = 'tooMany'

  const itemProblemsByKey: Record<string, ItemProblems> = {}
  for (const item of draft.items) {
    const found = itemProblems(item, draft.status, problems.date ? '' : draft.date, today)
    if (Object.keys(found).length > 0) itemProblemsByKey[item.key] = found
  }
  if (Object.keys(itemProblemsByKey).length > 0) problems.item = itemProblemsByKey
  if (trimmed(draft.clinic).length > HEALTH_EVENT_LIMITS.clinic) problems.clinic = 'tooLong'
  if (trimmed(draft.notes).length > HEALTH_EVENT_LIMITS.notes) problems.notes = 'tooLong'
  return problems
}

const hasProblems = (problems: EventProblems) => Object.keys(problems).length > 0

/** The body of a new record, or what is wrong with the form. */
export function readNewEvent(draft: EventDraft, today: string): ReadEvent {
  const problems = commonProblems(draft, today, null)
  if (hasProblems(problems)) return { ok: false, problems }
  const input = HealthEventInputSchema.safeParse({
    kind: draft.kind,
    status: draft.status,
    date: draft.date,
    clinic: orNull(draft.clinic),
    notes: orNull(draft.notes),
    items: draft.items.map((item) => ({
      name: orNull(item.name),
      targets: item.targets,
      product_id: item.productId,
      ...(draft.status === 'done' ? { next_on: item.next === '' ? null : item.next } : {}),
    })),
  })
  return input.success ? { ok: true, input: input.data } : refused
}

type PatchItem = NonNullable<HealthEventPatch['items']>[number]

function patchItems(draft: EventDraft): PatchItem[] {
  return draft.items.map((item) => ({
    ...(item.id ? { id: item.id } : {}),
    name: orNull(item.name),
    targets: item.targets,
    product_id: item.productId,
  }))
}

/**
 * The change to a plan: only what differs from it. Its day is sent only when
 * moved (an overdue plan's own day would be refused as past); the items are
 * sent whole when any of them changed, each kept one with its id.
 */
export function readPlanChange(plan: HealthEvent, draft: EventDraft, today: string): ReadPlanChange {
  if (plan.status !== 'planned') throw new Error('only a plan is corrected')
  const problems = commonProblems(draft, today, plan.date)
  if (hasProblems(problems)) return { ok: false, problems }

  const before = draftFromPlan(plan)
  const patch: HealthEventPatch = {}
  if (draft.date !== plan.date) patch.date = draft.date
  if (orNull(draft.clinic) !== orNull(before.clinic)) patch.clinic = orNull(draft.clinic)
  if (orNull(draft.notes) !== orNull(before.notes)) patch.notes = orNull(draft.notes)
  const items = patchItems(draft)
  if (JSON.stringify(items) !== JSON.stringify(patchItems(before))) patch.items = items

  if (Object.keys(patch).length === 0) return { ok: true, patch: null }
  const checked = HealthEventPatchSchema.safeParse(patch)
  return checked.success ? { ok: true, patch: checked.data } : refused
}

/** Whether the form differs from how it opened: the leave warning asks only then. */
export function draftChanged(before: EventDraft, after: EventDraft): boolean {
  const shape = (draft: EventDraft) =>
    JSON.stringify({
      ...draft,
      // What is saved, not how the form keeps it.
      items: draft.items.map((item) => [item.id, item.source, item.name, item.productId, item.targets, item.next]),
    })
  return shape(before) !== shape(after)
}

// ---------- A failed save ----------

export type EventSaveFailure =
  /** 400: the client's check and the contract disagree. */
  | 'rejected'
  /** 404: the pet or the plan is gone. */
  | 'gone'
  /** 409 on a new record: an earlier try with this key was saved, with what it said then. */
  | 'alreadySaved'
  /** 409 record_done: the plan was marked done meanwhile; it is read-only now. */
  | 'done'
  | 'signedOut'
  | 'deleting'
  /** No answer: the form keeps everything and the same key is sent again. */
  | 'offline'
  | 'failed'

export function eventSaveFailure(error: unknown): EventSaveFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'bad_request':
        return 'rejected'
      case 'not_found':
        return 'gone'
      case 'conflict':
        return 'alreadySaved'
      case 'record_done':
        return 'done'
      case 'unauthorized':
        return 'signedOut'
      case 'account_deleting':
        return 'deleting'
      default:
        return 'failed'
    }
  }
  if (error instanceof TypeError || error instanceof ApiTimeoutError) return 'offline'
  return 'failed'
}
