import type { HealthTarget } from '@lapka/contracts'
import {
  canSelect,
  missingFields,
  parasiteGroups,
  type DraftEntry,
  type DraftEventEntry,
  type DraftMedicationEntry,
  type EntryEdits,
  type MissingField,
  type Selection,
} from '@lapka/shared'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { eventItemName, formatDay } from '@/features/medical-record/view-model'
import type { EventDraft, ItemDraft } from '@/features/medical-record/events/event-form'
import type { CourseDraft } from '@/features/medical-record/medications/course-form'

/**
 * The recognition screens' words and the edit's conversions, apart from React
 * so they are unit tested. The rules of selection and of the confirm body
 * are the shared ones (`@lapka/shared` documents/review.ts).
 */

// ---------- A row of the review ----------

export type EntryRowView = {
  title: string
  /** Was the name read at all: an unread name is said as such, not invented. */
  named: boolean
  /** The day, or that it was not read. */
  date: { text: string; missing: boolean }
  /** Targets, the next date, «как давать», the course's days: each a line. */
  details: string[]
  /** «Проверьте: дата, название» — what the document was unsure of. */
  unsure: string | null
  /** Said next to the entry: what it lacks to be saved. */
  missing: string[]
  duplicate: { text: string; recordId: string | null } | null
  selectable: boolean
}

const day = (dict: Dictionary, value: string) => formatDay(dict.medicalRecord, value, true)

function eventDetails(dict: Dictionary, entry: DraftEventEntry): string[] {
  const words = dict.documents.recognition.review
  const lines: string[] = []
  if (entry.targets.length > 0) {
    lines.push(
      entry.type === 'parasite'
        ? parasiteGroups(entry.targets as HealthTarget[]).map((group) => dict.medicalRecord.parasiteGroups[group]).join(', ')
        : entry.targets.map((code) => (dict.medicalRecord.targets as Record<string, string>)[code] ?? code).join(', '),
    )
  }
  if (entry.next_date) lines.push(words.next.replace('{date}', day(dict, entry.next_date)))
  return lines
}

function courseDetails(entry: DraftMedicationEntry): string[] {
  return entry.dosage?.trim() ? [entry.dosage.trim()] : []
}

function courseDays(dict: Dictionary, entry: DraftMedicationEntry): string | null {
  const words = dict.documents.recognition.review
  if (!entry.start_date) return null
  return entry.end_date
    ? words.courseRange.replace('{start}', day(dict, entry.start_date)).replace('{end}', day(dict, entry.end_date))
    : words.courseFrom.replace('{start}', day(dict, entry.start_date))
}

/** How a row of the review reads: never a made-up name or day. */
export function entryRow(dict: Dictionary, entry: DraftEntry): EntryRowView {
  const words = dict.documents.recognition.review
  const missing = missingFields(entry)
  const name = entry.name?.trim() ?? ''
  const title =
    name !== ''
      ? name
      : entry.type !== 'medication' && entry.targets.length > 0
        ? eventItemName(dict, entry.type, { name: null, targets: entry.targets })
        : words.noName
  const dateText = entry.type === 'medication' ? courseDays(dict, entry) : entry.date ? day(dict, entry.date) : null
  return {
    title,
    named: title !== words.noName,
    date: { text: dateText ?? words.noDate, missing: dateText === null },
    details: entry.type === 'medication' ? courseDetails(entry) : eventDetails(dict, entry),
    unsure: entry.unsure.length > 0 ? words.unsureFields.replace('{fields}', entry.unsure.map((field) => words.fields[field]).join(', ')) : null,
    missing: missing.map((field: MissingField) => words.missing[field]),
    duplicate: entry.duplicate
      ? {
          text: entry.duplicate.title ? words.duplicateNamed.replace('{title}', entry.duplicate.title) : words.duplicate,
          recordId: entry.duplicate.record_id,
        }
      : null,
    selectable: canSelect(entry),
  }
}

/**
 * The text as the document has it, in guillemets once: a text that already
 * carries quotes of its own («Мульти…» — …) is shown as it is.
 */
export function quoteOnce(text: string, locale: 'ru' | 'en'): string {
  const trimmed = text.trim()
  if (/[«»"“”„]/.test(trimmed)) return trimmed
  return locale === 'ru' ? `«${trimmed}»` : `“${trimmed}”`
}

// ---------- The edit: an entry in the medical record's own forms ----------

/**
 * A vaccination or treatment entry as the event form's draft: a done record
 * of one item. The catalogue product stays a product; a read name the
 * owner's own; none with targets «Без препарата». The next date is the
 * document's and is not re-suggested until the owner changes the product.
 */
export function eventDraftOf(entry: DraftEventEntry): EventDraft {
  const name = entry.name?.trim() ?? ''
  const item: ItemDraft = {
    key: entry.key,
    source: entry.product_id ? 'catalog' : name !== '' || entry.targets.length === 0 ? 'manual' : 'none',
    name,
    manufacturer: null,
    productId: entry.product_id,
    targets: entry.targets as HealthTarget[],
    interval: null,
    next: entry.next_date ?? '',
    nextTouched: true,
  }
  return { kind: entry.type, status: 'done', date: entry.date ?? '', items: [item], clinic: '', notes: '' }
}

/** The form's draft back as the entry, once «Готово» found nothing wrong: the owner has checked it, so nothing is unsure. */
export function entryFromEventDraft(entry: DraftEventEntry, draft: EventDraft): DraftEventEntry {
  const item = draft.items[0]
  if (!item) return entry
  return {
    ...entry,
    date: draft.date || null,
    name: item.source === 'none' ? null : item.name.trim() || null,
    product_id: item.productId,
    targets: [...item.targets],
    next_date: item.next || null,
    unsure: [],
  }
}

export function courseDraftOf(entry: DraftMedicationEntry): CourseDraft {
  return {
    key: entry.key,
    name: entry.name ?? '',
    dosage: entry.dosage ?? '',
    start: entry.start_date ?? '',
    end: entry.end_date ?? '',
    ongoing: false,
  }
}

export function entryFromCourseDraft(entry: DraftMedicationEntry, draft: CourseDraft): DraftMedicationEntry {
  return {
    ...entry,
    name: draft.name.trim() || null,
    dosage: draft.dosage.trim() || null,
    start_date: draft.start || null,
    end_date: draft.ongoing ? null : draft.end || null,
    unsure: [],
  }
}

/** What the edit holds while it is open: the form's own draft, so it survives a trip to the original. */
export type EditState = { key: string; form: { kind: 'event'; draft: EventDraft } | { kind: 'course'; draft: CourseDraft } }

export function editStateOf(entry: DraftEntry): EditState {
  return entry.type === 'medication'
    ? { key: entry.key, form: { kind: 'course', draft: courseDraftOf(entry) } }
    : { key: entry.key, form: { kind: 'event', draft: eventDraftOf(entry) } }
}

/**
 * The selection once an edit is done: a complete entry is ticked — the owner
 * just checked it — unless it is a possible duplicate, which keeps the
 * owner's own choice; an incomplete one cannot be.
 */
export function selectionAfterEdit(selection: Selection, entry: DraftEntry): Selection {
  const ticked = canSelect(entry) && (entry.duplicate === null || Boolean(selection[entry.key]))
  return { ...selection, [entry.key]: ticked }
}

// ---------- Kept across a trip to the original ----------

/**
 * The review as it was when the owner opened a page of the original: the
 * selection, the edits, an open edit with its typed values, where the list
 * was scrolled and which control had focus. Kept for this tab only
 * (sessionStorage), read once on the way back.
 */
export type ReviewMemory = {
  docId: string
  selection: Selection
  edits: EntryEdits
  editing: EditState | null
  scrollY: number
  focusId: string | null
}

export const reviewMemoryKey = (docId: string) => `lapka-document-review-${docId}`

/**
 * A memory read back, trusted only as far as it fits this draft: another
 * document's, a broken one, or keys the draft does not have are dropped.
 */
export function readReviewMemory(raw: string | null, docId: string, keys: readonly string[]): ReviewMemory | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const memory = value as Partial<ReviewMemory>
  if (memory.docId !== docId) return null
  const known = new Set(keys)
  const pick = <T,>(record: unknown): Record<string, T> =>
    record && typeof record === 'object'
      ? Object.fromEntries(Object.entries(record as Record<string, T>).filter(([key]) => known.has(key)))
      : {}
  const selection = Object.fromEntries(Object.entries(pick<unknown>(memory.selection)).map(([key, on]) => [key, on === true]))
  const edits = Object.fromEntries(
    Object.entries(pick<DraftEntry>(memory.edits)).filter(([, entry]) => entry && typeof entry === 'object' && typeof entry.type === 'string'),
  )
  const editing =
    memory.editing && typeof memory.editing === 'object' && known.has(memory.editing.key) && memory.editing.form ? memory.editing : null
  return {
    docId,
    selection,
    edits,
    editing,
    scrollY: typeof memory.scrollY === 'number' && memory.scrollY >= 0 ? memory.scrollY : 0,
    focusId: typeof memory.focusId === 'string' && /^[\w:-]+$/.test(memory.focusId) ? memory.focusId : null,
  }
}

/** Ids of the review's controls, so focus finds them again. */
export const reviewIds = {
  checkbox: (key: string) => `recognition-${key}-select`,
  edit: (key: string) => `recognition-${key}-edit`,
  page: (key: string) => `recognition-${key}-page`,
  editPage: (key: string) => `recognition-${key}-edit-page`,
}
