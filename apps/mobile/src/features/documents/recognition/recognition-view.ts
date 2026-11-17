import type { HealthTarget } from '@lapka/contracts'
import {
  canSelect,
  missingFields,
  type DraftEntry,
  type DraftEventEntry,
  type DraftMedicationEntry,
  type MedicationInput,
  type SavedGroup,
  type Selection,
} from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { dayInput } from '@/lib/calendar-day'
import { itemName, targetList } from '@/features/medical-record/due'
import type { EventDraft, ItemDraft, ReadDraft } from '@/features/medical-record/event-form'
import type { CourseDraft } from '@/features/medical-record/medications'

/**
 * What the recognition screens say, and the edit's conversions, apart from
 * React so they are unit tested. The rules — which entries start ticked,
 * which can be, what «Добавить выбранное» sends, what was saved — are the
 * shared ones (`@lapka/shared` documents/review.ts); this is only the app's
 * words and forms around them, as the site's `recognition-view.ts`.
 */

// ---------- A row of the review ----------

export type EntryRowView = {
  title: string
  /** Was the name read at all: an unread one is said as such, never invented. */
  named: boolean
  /** The day, or that it was not read. */
  date: { text: string; missing: boolean }
  /** Targets, the next date, «как давать»: a line each. */
  details: string[]
  /** «Проверьте: дата, название» — what the document was unsure of. */
  unsure: string | null
  /** Said next to the entry: what it lacks to be saved. */
  missing: string[]
  duplicate: { text: string; recordId: string | null } | null
  selectable: boolean
}

const day = (t: Dictionary, value: string) => t.day(value, true)

function eventDetails(t: Dictionary, entry: DraftEventEntry): string[] {
  const words = t.documents.recognition.review
  const lines: string[] = []
  // Only when the name says something else: «Нобивак» with its diseases; a nameless one is already named by them.
  if (entry.targets.length > 0 && (entry.name ?? '').trim() !== '') lines.push(targetList(t, entry.targets))
  if (entry.next_date) lines.push(words.next(day(t, entry.next_date)))
  return lines
}

function courseDays(t: Dictionary, entry: DraftMedicationEntry): string | null {
  const words = t.documents.recognition.review
  if (!entry.start_date) return null
  return entry.end_date ? words.courseRange(day(t, entry.start_date), day(t, entry.end_date)) : words.courseFrom(day(t, entry.start_date))
}

/** How a row of the review reads: never a made-up name or day. */
export function entryRow(t: Dictionary, entry: DraftEntry): EntryRowView {
  const words = t.documents.recognition.review
  const name = entry.name?.trim() ?? ''
  const title =
    name !== ''
      ? name
      : entry.type !== 'medication' && entry.targets.length > 0
        ? itemName(t, { name: null, targets: entry.targets }, entry.type)
        : words.noName
  const dateText = entry.type === 'medication' ? courseDays(t, entry) : entry.date ? day(t, entry.date) : null
  return {
    title,
    named: title !== words.noName,
    date: { text: dateText ?? words.noDate, missing: dateText === null },
    details: entry.type === 'medication' ? (entry.dosage?.trim() ? [entry.dosage.trim()] : []) : eventDetails(t, entry),
    unsure: entry.unsure.length > 0 ? words.unsureFields(entry.unsure.map((field) => words.fields[field]).join(', ')) : null,
    missing: missingFields(entry).map((field) => words.missing[field]),
    duplicate: entry.duplicate
      ? {
          text: entry.duplicate.title ? words.duplicateNamed(entry.duplicate.title) : words.duplicate,
          recordId: entry.duplicate.record_id,
        }
      : null,
    selectable: canSelect(entry),
  }
}

/** The whole row said at once, for the checkbox: name, day, and what needs the owner. */
export function entryHint(row: EntryRowView): string {
  return [row.date.text, ...row.details, row.unsure, ...row.missing, row.duplicate?.text].filter(Boolean).join('. ')
}

// ---------- The edit: an entry in the medical record's own forms ----------

/**
 * A vaccination or treatment entry as the record form's draft: a done record
 * of one item. A catalogue product stays the product; a read name is the
 * owner's own; none with targets is «Без препарата». The next date is the
 * document's, as a date of one's own; with none in the document, none —
 * the form suggests one only once the owner picks a product.
 */
export function eventDraftOf(entry: DraftEventEntry): EventDraft {
  const name = entry.name?.trim() ?? ''
  const item: ItemDraft = {
    key: entry.key,
    kind: entry.type,
    name,
    targets: entry.targets as HealthTarget[],
    next: entry.next_date ? 'custom' : 'none',
    nextText: entry.next_date ? dayInput(entry.next_date) : '',
    source: entry.product_id ? 'catalog' : name !== '' || entry.targets.length === 0 ? 'manual' : 'none',
    productId: entry.product_id,
    interval: null,
  }
  return { kind: entry.type, status: 'done', date: entry.date ? dayInput(entry.date) : '', items: [item], clinic: '', notes: '' }
}

type ReadEvent = Extract<ReadDraft, { ok: true }>['value']

/**
 * The entry as the form read it, once «Готово» found nothing wrong
 * (`readDraft`, the form's own rules): the owner has checked it, so nothing
 * is unsure any more.
 */
export function entryFromEventRead(entry: DraftEventEntry, value: ReadEvent): DraftEventEntry {
  const item = value.items[0]
  if (!item) return entry
  return {
    ...entry,
    date: value.date,
    name: item.name,
    product_id: item.product_id,
    targets: [...item.targets],
    next_date: item.next_on,
    unsure: [],
  }
}

export function courseDraftOf(entry: DraftMedicationEntry): CourseDraft {
  return {
    key: entry.key,
    name: entry.name ?? '',
    dosage: entry.dosage ?? '',
    start: entry.start_date ? dayInput(entry.start_date) : '',
    end: entry.end_date ? dayInput(entry.end_date) : '',
    ongoing: false,
  }
}

/** The course as the form read it (`readCourses`): checked by the owner, nothing unsure. */
export function entryFromCourseRead(entry: DraftMedicationEntry, value: MedicationInput): DraftMedicationEntry {
  return {
    ...entry,
    name: value.name.trim() || null,
    dosage: value.dosage ?? null,
    start_date: value.started_on ?? null,
    end_date: value.ended_on ?? null,
    unsure: [],
  }
}

/** What the edit holds while it is open: the form's own draft. */
export type EditState = { key: string; form: { kind: 'event'; draft: EventDraft } | { kind: 'course'; draft: CourseDraft } }

export function editStateOf(entry: DraftEntry): EditState {
  return entry.type === 'medication'
    ? { key: entry.key, form: { kind: 'course', draft: courseDraftOf(entry) } }
    : { key: entry.key, form: { kind: 'event', draft: eventDraftOf(entry) } }
}

/** Whether the open edit differs from how it opened: «Отмена» asks only then. */
export function editChanged(before: EditState, after: EditState): boolean {
  return JSON.stringify(before.form) !== JSON.stringify(after.form)
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

// ---------- After the save ----------

/** «Прививки — Добавлена 1 запись»: what was saved, a line per section, from `savedSummary`. */
export function savedLines(t: Dictionary, groups: readonly SavedGroup[]): Array<{ section: SavedGroup['section']; title: string; count: string }> {
  const words = t.documents.recognition
  return groups.map((group) => ({
    section: group.section,
    title: words.review.groups[group.section],
    count: group.section === 'medications' ? words.confirmed.courses(group.records) : words.confirmed.records(group.records),
  }))
}
