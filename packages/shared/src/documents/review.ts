import type { HealthEventInput, MedicationsInput } from '@lapka/contracts'

/** One course as `POST /medications` takes it. */
export type MedicationInput = MedicationsInput['items'][number]

/**
 * The review of a recognised document (DOC-2, spec «Экран проверки»), as the
 * web and the phone share it: what a suggested record is, which ones start
 * selected, which ones may be selected at all, and what «Добавить выбранное»
 * sends. No UI and no text: each app says it in its own words.
 *
 * The server's draft is not in the contracts yet (DOC-2 adds
 * `DocumentDraftSchema`): these types are the shape this review is built
 * on, and the contract will be held to them when it lands. Nothing here
 * calls the API.
 */

/** What a document may be unsure of, per the recognition schema in the spec. */
export type UnsureField = 'date' | 'name' | 'next_date' | 'dosage'

/**
 * A suggested record that is already in the medical record: the server
 * names the match when it can, so the screen can point at the real record
 * and never at an invented one.
 */
export type DraftDuplicate = {
  /** The existing record (a health event or a course), when the server identified it. */
  record_id: string | null
  /** Its name as the record shows it, when known. */
  title: string | null
}

type EntryBase = {
  /** Stable within the draft: edits and the selection are kept by it. */
  key: string
  /** The page of the document it was read from, from 1. */
  page: number
  unsure: UnsureField[]
  duplicate: DraftDuplicate | null
  /** The server's own opinion; `initialSelection` still checks the rules. */
  selected_by_default: boolean
}

/** A vaccination or a treatment: one item of a record, done on `date`. */
export type DraftEventEntry = EntryBase & {
  type: 'vaccination' | 'parasite'
  /** yyyy-mm-dd, or null when the document does not say it readably. */
  date: string | null
  /** The product's name, or the name as written; null when unreadable. */
  name: string | null
  /** The catalogue product, only on an unambiguous match. */
  product_id: string | null
  /** Contract target codes that fit the kind. */
  targets: string[]
  /** The next one, as written in the document or suggested by the product's interval. */
  next_date: string | null
}

/** A course from a prescription. */
export type DraftMedicationEntry = EntryBase & {
  type: 'medication'
  name: string | null
  /** «Как давать», one line as the doctor wrote it. */
  dosage: string | null
  start_date: string | null
  end_date: string | null
}

export type DraftEntry = DraftEventEntry | DraftMedicationEntry

/** The draft a recognised document waits in review with. */
export type RecognitionDraft = {
  /** The pet's name as the document has it, to warn about another pet. */
  pet_name_as_written: string | null
  document_date: string | null
  clinic: string | null
  entries: DraftEntry[]
}

/** The owner's corrections, by entry key: the whole entry as edited. Kept on the device until saved. */
export type EntryEdits = Record<string, DraftEntry>

export type Selection = Record<string, boolean>

/** The entry as the owner sees it now: their edit, or the draft's value. */
export function currentEntry(entry: DraftEntry, edits: EntryEdits): DraftEntry {
  const edited = edits[entry.key]
  return edited && edited.type === entry.type ? { ...edited, key: entry.key, page: entry.page } : entry
}

/** A field a record cannot be saved without. */
export type MissingField = 'date' | 'name' | 'start_date'

const blank = (value: string | null | undefined) => (value ?? '').trim() === ''

/**
 * What an entry still lacks, by the medical record's own rules: a vaccination
 * or treatment needs its day and a name or at least one target (the form's
 * «название или хотя бы одна болезнь»); a course needs its name and start.
 */
export function missingFields(entry: DraftEntry): MissingField[] {
  const missing: MissingField[] = []
  if (entry.type === 'medication') {
    if (blank(entry.name)) missing.push('name')
    if (blank(entry.start_date)) missing.push('start_date')
    return missing
  }
  if (blank(entry.date)) missing.push('date')
  if (blank(entry.name) && entry.targets.length === 0) missing.push('name')
  return missing
}

/** An entry can be ticked only once nothing required is missing. */
export function canSelect(entry: DraftEntry): boolean {
  return missingFields(entry).length === 0
}

/**
 * The selection the review opens with: the confident, complete records.
 * Anything unsure, a possible duplicate, or one the server did not suggest,
 * starts unticked — the owner may still tick it once it is complete.
 */
export function initialSelection(draft: Pick<RecognitionDraft, 'entries'>): Selection {
  const selection: Selection = {}
  for (const entry of draft.entries) {
    selection[entry.key] = entry.selected_by_default && entry.unsure.length === 0 && entry.duplicate === null && canSelect(entry)
  }
  return selection
}

/**
 * The selection after an entry changed: one that can no longer be saved is
 * unticked, so the counter and the body never include it.
 */
export function settleSelection(draft: Pick<RecognitionDraft, 'entries'>, edits: EntryEdits, selection: Selection): Selection {
  const next: Selection = {}
  for (const entry of draft.entries) next[entry.key] = Boolean(selection[entry.key]) && canSelect(currentEntry(entry, edits))
  return next
}

/** The entries that will be sent: ticked and complete, in the draft's order. */
export function selectedEntries(draft: Pick<RecognitionDraft, 'entries'>, edits: EntryEdits, selection: Selection): DraftEntry[] {
  return draft.entries.map((entry) => currentEntry(entry, edits)).filter((entry) => selection[entry.key] && canSelect(entry))
}

/** The counter on «Добавить выбранное»; zero disables it. */
export function selectedCount(draft: Pick<RecognitionDraft, 'entries'>, edits: EntryEdits, selection: Selection): number {
  return selectedEntries(draft, edits, selection).length
}

/** One record of the confirm body, in the shape the medical record's own inputs use. */
export type ConfirmEntry =
  | { key: string; type: 'event'; event: HealthEventInput }
  | { key: string; type: 'medication'; medication: MedicationInput }

/** What «Добавить выбранное» sends (DOC-2 `POST …/confirm`, with an idempotency key). */
export type ConfirmBody = { clinic: string | null; entries: ConfirmEntry[] }

const orNull = (value: string | null | undefined) => (blank(value) ? null : (value ?? '').trim())

/**
 * The body of «Добавить выбранное»: only the ticked, complete entries, with
 * the owner's edits, each as the record the forms would send for it — one
 * item of a done vaccination or treatment, or one course. A next date goes
 * only when it follows the record and is not in the past (the server makes
 * no plan in the past; the review never invents one). Grouping several
 * vaccinations of one day into one record is the server's
 * (`confirm_pet_document`), not this body's.
 */
export function confirmBody(
  draft: Pick<RecognitionDraft, 'entries' | 'clinic'>,
  edits: EntryEdits,
  selection: Selection,
  today: string,
  clinic: string | null = draft.clinic,
): ConfirmBody {
  const clinicText = orNull(clinic)
  const entries = selectedEntries(draft, edits, selection).map((entry): ConfirmEntry => {
    if (entry.type === 'medication') {
      const medication: MedicationInput = {
        name: (entry.name ?? '').trim(),
        dosage: orNull(entry.dosage),
        started_on: orNull(entry.start_date),
        ended_on: orNull(entry.end_date),
      }
      return { key: entry.key, type: 'medication', medication }
    }
    const date = (entry.date ?? '').trim()
    const next = orNull(entry.next_date)
    const item: HealthEventInput['items'][number] = {
      name: orNull(entry.name),
      targets: entry.targets as HealthEventInput['items'][number]['targets'],
      product_id: entry.product_id,
    }
    if (next && next > date && next >= today) item.next_on = next
    const event: HealthEventInput = { kind: entry.type, status: 'done', date, clinic: clinicText, items: [item] }
    return { key: entry.key, type: 'event', event }
  })
  return { clinic: clinicText, entries }
}

/** The medical record's sections a review saves into, in the screen's order. */
export type SavedSection = 'vaccinations' | 'parasites' | 'medications'

export type SavedGroup = {
  section: SavedSection
  /** Records made: two vaccines of one day and clinic are one record. */
  records: number
  /** What was in them: vaccines, treatments or courses. */
  items: number
}

/** What the server answered a confirm with: the records it made. */
export type SavedRecords = {
  events: ReadonlyArray<{ kind: 'vaccination' | 'parasite' | 'visit'; status: 'done' | 'planned'; items: readonly unknown[] }>
  medications: readonly unknown[]
}

/**
 * The success screen's groups, from what was actually saved — never from
 * what was selected: two vaccines may have become one record. Plans made of
 * next dates are not counted as saved records. A group with nothing saved is
 * left out (no «Прививки» after a prescription).
 */
export function savedSummary(saved: SavedRecords): SavedGroup[] {
  const done = saved.events.filter((event) => event.status === 'done')
  const groups: SavedGroup[] = [
    {
      section: 'vaccinations',
      records: done.filter((event) => event.kind === 'vaccination').length,
      items: done.filter((event) => event.kind === 'vaccination').reduce((sum, event) => sum + event.items.length, 0),
    },
    {
      section: 'parasites',
      records: done.filter((event) => event.kind === 'parasite').length,
      items: done.filter((event) => event.kind === 'parasite').reduce((sum, event) => sum + event.items.length, 0),
    },
    { section: 'medications', records: saved.medications.length, items: saved.medications.length },
  ]
  return groups.filter((group) => group.records > 0)
}

/** Whether some saved record holds several items: the success screen says they were merged. */
export function savedMerged(groups: readonly SavedGroup[]): boolean {
  return groups.some((group) => group.items > group.records)
}

/** The review's groups, in the screen's order, without empty ones. */
export function reviewGroups<T extends Pick<DraftEntry, 'type'>>(entries: readonly T[]): Array<{ section: SavedSection; entries: T[] }> {
  const of = (type: DraftEntry['type']) => entries.filter((entry) => entry.type === type)
  return (
    [
      { section: 'vaccinations', entries: of('vaccination') },
      { section: 'parasites', entries: of('parasite') },
      { section: 'medications', entries: of('medication') },
    ] as Array<{ section: SavedSection; entries: T[] }>
  ).filter((group) => group.entries.length > 0)
}

/**
 * Whether the document names another pet: a name was read and, compared
 * without case and spaces, it is not this pet's. Only a warning — the pet is
 * never switched.
 */
export function petNameMismatch(asWritten: string | null, petName: string): boolean {
  if (blank(asWritten)) return false
  const norm = (value: string) => value.trim().toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
  return norm(asWritten as string) !== norm(petName)
}
