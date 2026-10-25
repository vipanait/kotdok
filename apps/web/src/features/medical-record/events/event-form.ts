import {
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
  apiFailure,
  eventPatchItems,
  eventProblems,
  productName,
  readEventInput,
  suggestNextDay,
  suggestionInterval,
  type EventDayProblem,
  type EventFields,
  type EventReadOptions,
  type Interval,
  type NextDayProblem,
  type SupportedLocale,
} from '@lapka/shared'
import type { RecordType } from '../routes'

/**
 * The vaccination and treatment form (web v1 «vaccine-done», «vaccine-plan»,
 * «catalog», «manual», «targets»; MW-04 reuses it for treatments) as data,
 * apart from React so its rules are unit tested:
 *
 * - «Сделано» starts today, «Запланировать» with no day; switching keeps the
 *   items, and a plan has no next dates (they are kept aside, not lost);
 * - an item is a catalogue product (its name and diseases), the owner's own
 *   name, or «Без препарата» — diseases only, at least one;
 * - an interval only suggests the next date, the owner changes or clears
 *   it: the catalogue product's own, or — the owner's own name, «Без
 *   препарата» — the fallback for the kind and diseases, as on the phone
 *   (shared `suggestionInterval`, MW-09);
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

/**
 * A product picked from the catalogue: its name — the one the reader was
 * shown, English to an English reader — its diseases and interval; the next
 * date follows it.
 */
export function productItem(
  key: string,
  product: HealthProduct,
  draft: EventDraft,
  today: string,
  locale: SupportedLocale,
): ItemDraft {
  const fits = draft.kind === 'vaccination' ? VaccineTargetSchema : ParasiteTargetSchema
  const item: ItemDraft = {
    key,
    source: 'catalog',
    name: productName(product, locale),
    manufacturer: product.manufacturer,
    productId: product.id,
    targets: product.targets.filter((code) => fits.safeParse(code).success) as HealthTarget[],
    interval: product.interval,
    next: '',
    nextTouched: false,
  }
  return followSuggestion(item, draft, today)
}

/**
 * «Нет в списке — ввести название»: the owner's own name. Its next date is
 * suggested once it is in a form (`followSuggestion`): by the fallback interval.
 */
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
    items: draft.items.map((item) => followSuggestion(item, { kind: draft.kind, status, date }, today)),
  }
}

function suggested(kind: EventFormKind, item: ItemDraft, status: HealthEvent['status'], date: string, today: string): string {
  if (status !== 'done' || !date) return ''
  return suggestNextDay(date, suggestionInterval(kind, item.interval, item.targets), today) ?? ''
}

/**
 * An item's next date follows the suggestion — for its interval, its
 * diseases (the fallback depends on them) and the record's day — until the
 * owner sets or clears it by hand.
 */
export function followSuggestion(item: ItemDraft, draft: Pick<EventDraft, 'kind' | 'status' | 'date'>, today: string): ItemDraft {
  if (item.nextTouched) return item
  const next = suggested(draft.kind, item, draft.status, draft.date, today)
  return next === item.next ? item : { ...item, next }
}

/** A new record day moves the next dates the owner has not set by hand. */
export function changeDate(draft: EventDraft, date: string, today: string): EventDraft {
  return {
    ...draft,
    date,
    items: draft.items.map((item) => followSuggestion(item, { ...draft, date }, today)),
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

/** The form as the shared readers take it. */
function fieldsOf(draft: EventDraft): EventFields {
  return {
    kind: draft.kind,
    status: draft.status,
    date: draft.date,
    clinic: draft.clinic,
    notes: draft.notes,
    items: draft.items.map((item) => ({ key: item.key, id: item.id, name: item.name, targets: item.targets, productId: item.productId, next: item.next })),
  }
}

/**
 * What is wrong with the form: the shared rules (`eventProblems`, the
 * phone's too), plus which field this form points at for an item that
 * names nothing — the name the owner chose to type, the diseases of «Без
 * препарата» — and a typed name left empty even beside chosen diseases.
 */
function commonProblems(draft: EventDraft, today: string, keptDate: string | null): EventProblems {
  const { item: sharedItems, ...rest } = eventProblems(fieldsOf(draft), today, { keptDate, withNext: true })
  const problems: EventProblems = { ...rest }
  const byKey: Record<string, ItemProblems> = {}
  for (const item of draft.items) {
    const found = sharedItems?.[item.key] ?? {}
    const own: ItemProblems = {}
    if (found.name === 'tooLong') own.name = 'tooLong'
    if (found.next) own.next = found.next
    if (found.empty) {
      if (item.source === 'none') own.targets = 'empty'
      else own.name = 'empty'
    }
    // The owner chose to type a name: it is what the item is.
    if (item.source === 'manual' && trimmed(item.name) === '') own.name = 'empty'
    if (Object.keys(own).length > 0) byKey[item.key] = own
  }
  if (Object.keys(byKey).length > 0) problems.item = byKey
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

const hasProblems = (problems: EventProblems) => Object.keys(problems).length > 0

const NEW_RECORD: EventReadOptions = { keptDate: null, withNext: true }

/** The body of a new record, or what is wrong with the form. */
export function readNewEvent(draft: EventDraft, today: string): ReadEvent {
  const problems = commonProblems(draft, today, null)
  if (hasProblems(problems)) return { ok: false, problems }
  const read = readEventInput(fieldsOf(draft), today, NEW_RECORD)
  if (read.ok) return read
  return read.rejected ? refused : { ok: false, problems: commonProblems(draft, today, null) }
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
  const items = eventPatchItems(fieldsOf(draft))
  if (JSON.stringify(items) !== JSON.stringify(eventPatchItems(fieldsOf(before)))) patch.items = items

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
  const failure = apiFailure(error)
  switch (failure) {
    // A 409 of a record write is this very save, landed earlier.
    case 'keyReused':
    case 'conflict':
      return 'alreadySaved'
    case 'recordDone':
      return 'done'
    case 'rejected':
    case 'gone':
    case 'signedOut':
    case 'deleting':
    case 'offline':
      return failure
    default:
      return 'failed'
  }
}
