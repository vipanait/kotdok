import { describe, expect, it } from 'vitest'
import { HealthEventInputSchema } from '@lapka/contracts'
import type { DraftEventEntry, DraftMedicationEntry } from '@lapka/shared'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { readNewEvent } from '@/features/medical-record/events/event-form'
import { readNewCourses } from '@/features/medical-record/medications/course-form'
import {
  courseDraftOf,
  editStateOf,
  entryFromCourseDraft,
  entryFromEventDraft,
  entryRow,
  eventDraftOf,
  readReviewMemory,
  reviewMemoryKey,
  selectionAfterEdit,
} from '@/features/documents/recognition/recognition-view'

const TODAY = '2026-11-17'
const PRODUCT = '11111111-1111-4111-8111-111111111111'
const RECORD = '22222222-2222-4222-8222-222222222222'

const vaccine = (extra: Partial<DraftEventEntry> = {}): DraftEventEntry => ({
  key: 'v1',
  type: 'vaccination',
  page: 2,
  date: '2026-03-12',
  name: 'Нобивак Rabies',
  product_id: PRODUCT,
  targets: ['rabies'],
  next_date: '2027-03-12',
  unsure: [],
  duplicate: null,
  selected_by_default: true,
  ...extra,
})

const course = (extra: Partial<DraftMedicationEntry> = {}): DraftMedicationEntry => ({
  key: 'm1',
  type: 'medication',
  page: 1,
  name: 'Синулокс',
  dosage: '1 таблетка',
  start_date: '2026-11-12',
  end_date: null,
  unsure: [],
  duplicate: null,
  selected_by_default: true,
  ...extra,
})

describe('entryRow', () => {
  it('says the name, day, targets and next date', () => {
    const row = entryRow(ru, vaccine())
    expect(row).toMatchObject({ title: 'Нобивак Rabies', named: true, date: { text: '12 марта 2026', missing: false }, selectable: true })
    expect(row.details).toEqual(['Бешенство', 'Следующая: 12 марта 2027'])
  })

  it('never invents a name or a day: it says they were not read, and what is missing next to the entry', () => {
    const row = entryRow(ru, vaccine({ name: null, targets: [], date: null, unsure: ['date', 'name'] }))
    expect(row.title).toBe(ru.documents.recognition.review.noName)
    expect(row.named).toBe(false)
    expect(row.date).toEqual({ text: ru.documents.recognition.review.noDate, missing: true })
    expect(row.unsure).toBe('Проверьте: дата, название')
    expect(row.missing).toEqual([ru.documents.recognition.review.missing.date, ru.documents.recognition.review.missing.name])
    expect(row.selectable).toBe(false)
  })

  it('a duplicate names the real record when the server identified it', () => {
    const row = entryRow(en, vaccine({ duplicate: { record_id: RECORD, title: 'Rabies, 3 March 2024' } }))
    expect(row.duplicate).toEqual({ text: 'Already in the medical record: Rabies, 3 March 2024', recordId: RECORD })
  })

  it('a treatment says its parasite groups; a course its days and how to give it', () => {
    expect(entryRow(ru, vaccine({ type: 'parasite', targets: ['fleas', 'worms'], next_date: null })).details).toEqual(['Блохи, Глисты'])
    const row = entryRow(ru, course({ end_date: '2026-11-19' }))
    expect(row.date.text).toBe('С 12 ноября 2026 по 19 ноября 2026')
    expect(row.details).toEqual(['1 таблетка'])
  })
})

describe('the edit in the medical record forms', () => {
  it('opens a vaccination with its values, and the event form accepts it', () => {
    const draft = eventDraftOf(vaccine())
    expect(draft).toMatchObject({ kind: 'vaccination', status: 'done', date: '2026-03-12' })
    expect(draft.items[0]).toMatchObject({ key: 'v1', source: 'catalog', productId: PRODUCT, targets: ['rabies'], next: '2027-03-12', nextTouched: true })
    const read = readNewEvent(draft, TODAY)
    expect(read.ok).toBe(true)
    if (read.ok) expect(HealthEventInputSchema.safeParse(read.input).success).toBe(true)
  })

  it('an unread entry is refused by the form rules until it is filled', () => {
    const read = readNewEvent(eventDraftOf(vaccine({ date: null, name: null, targets: [], product_id: null })), TODAY)
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.problems.date).toBe('empty')
  })

  it('targets alone are «Без препарата»', () => {
    expect(eventDraftOf(vaccine({ name: null, product_id: null })).items[0].source).toBe('none')
  })

  it('«Готово» hands back the edited values, no longer unsure', () => {
    const entry = vaccine({ unsure: ['name'], name: '«Мульти…»', product_id: null })
    const draft = eventDraftOf(entry)
    draft.items[0] = { ...draft.items[0], name: 'Мультикан-8', next: '' }
    expect(entryFromEventDraft(entry, draft)).toMatchObject({ name: 'Мультикан-8', next_date: null, unsure: [], key: 'v1', page: 2 })
  })

  it('a course opens in the medicine form and comes back', () => {
    const draft = courseDraftOf(course())
    expect(readNewCourses([draft]).ok).toBe(true)
    expect(entryFromCourseDraft(course(), { ...draft, dosage: ' ', ongoing: true, end: '2026-12-01' })).toMatchObject({ dosage: null, end_date: null })
    expect(editStateOf(course()).form.kind).toBe('course')
  })

  it('a completed edit ticks the entry, but a duplicate keeps the owner\'s choice', () => {
    expect(selectionAfterEdit({ v1: false }, vaccine())).toEqual({ v1: true })
    expect(selectionAfterEdit({ v1: false }, vaccine({ duplicate: { record_id: null, title: null } }))).toEqual({ v1: false })
    expect(selectionAfterEdit({ v1: true }, vaccine({ date: null }))).toEqual({ v1: false })
  })
})

describe('readReviewMemory', () => {
  const kept = {
    docId: 'doc',
    selection: { v1: true, gone: true },
    edits: { v1: vaccine({ name: 'Другое' }), gone: vaccine() },
    editing: editStateOf(vaccine()),
    scrollY: 640,
    focusId: 'recognition-v1-page',
  }

  it('brings back the selection, edits, open edit, scroll and focus of this document only', () => {
    const memory = readReviewMemory(JSON.stringify(kept), 'doc', ['v1'])
    expect(memory?.selection).toEqual({ v1: true })
    expect(Object.keys(memory?.edits ?? {})).toEqual(['v1'])
    expect(memory?.editing?.key).toBe('v1')
    expect(memory?.scrollY).toBe(640)
    expect(memory?.focusId).toBe('recognition-v1-page')
  })

  it('ignores another document, broken JSON and an odd focus id', () => {
    expect(readReviewMemory(JSON.stringify(kept), 'other', ['v1'])).toBeNull()
    expect(readReviewMemory('{', 'doc', ['v1'])).toBeNull()
    expect(readReviewMemory(JSON.stringify({ ...kept, focusId: 'a b"', scrollY: -5 }), 'doc', ['v1'])).toMatchObject({ focusId: null, scrollY: 0 })
    expect(reviewMemoryKey('doc')).toBe('lapka-document-review-doc')
  })
})
