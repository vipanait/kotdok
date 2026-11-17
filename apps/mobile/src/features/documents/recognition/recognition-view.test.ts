import { describe, expect, it } from 'vitest'
import { initialSelection, savedSummary, type DraftEventEntry, type DraftMedicationEntry } from '@lapka/shared'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { readDraft } from '@/features/medical-record/event-form'
import { readCourses } from '@/features/medical-record/medications'
import {
  FIXTURE_PASSPORT_DRAFT,
  FIXTURE_RECIPE_DRAFT,
  FIXTURE_SAVED_PASSPORT,
  FIXTURE_SAVED_RECIPE,
  PREVIEW_STATES,
  STATE_TITLES,
} from './dev/fixtures'
import {
  courseDraftOf,
  editChanged,
  editStateOf,
  entryFromCourseRead,
  entryFromEventRead,
  entryHint,
  entryRow,
  eventDraftOf,
  savedLines,
  selectionAfterEdit,
} from './recognition-view'

const NOW = new Date('2026-11-17T12:00:00')

function vaccine(overrides: Partial<DraftEventEntry> = {}): DraftEventEntry {
  return {
    key: 'v',
    type: 'vaccination',
    page: 2,
    date: '2026-03-12',
    name: 'Вакцина',
    product_id: null,
    targets: ['rabies'],
    next_date: null,
    unsure: [],
    duplicate: null,
    selected_by_default: true,
    ...overrides,
  }
}

function course(overrides: Partial<DraftMedicationEntry> = {}): DraftMedicationEntry {
  return {
    key: 'm',
    type: 'medication',
    page: 1,
    name: 'Препарат',
    dosage: '1 таблетка утром',
    start_date: '2026-11-12',
    end_date: '2026-11-19',
    unsure: [],
    duplicate: null,
    selected_by_default: true,
    ...overrides,
  }
}

describe('a row of the review', () => {
  it('says the name, the day, the diseases and the next date', () => {
    const row = entryRow(ru, vaccine({ next_date: '2027-03-12' }))
    expect(row.title).toBe('Вакцина')
    expect(row.date).toEqual({ text: '12 марта 2026', missing: false })
    expect(row.details).toEqual(['Бешенство', 'Следующая: 12 марта 2027'])
    expect(row.selectable).toBe(true)
    expect(row.missing).toEqual([])
  })

  it('never invents a name or a day: it says they were not read, and what is missing next to the entry', () => {
    const row = entryRow(ru, vaccine({ name: null, targets: [], date: null, unsure: ['date', 'name'] }))
    expect(row.title).toBe('Название не распознано')
    expect(row.named).toBe(false)
    expect(row.date).toEqual({ text: 'Дата не распознана', missing: true })
    expect(row.unsure).toBe('Проверьте: дата, название')
    expect(row.missing).toEqual([
      'Нет даты — укажите её, чтобы добавить запись.',
      'Нет названия — укажите препарат или от чего, чтобы добавить запись.',
    ])
    expect(row.selectable).toBe(false)
  })

  it('names a nameless vaccine by its diseases, and a treatment by its parasite groups', () => {
    expect(entryRow(ru, vaccine({ name: null, targets: ['rabies'] })).title).toBe('Бешенство')
    const treatment = entryRow(ru, { ...vaccine({ name: null, targets: ['fleas', 'ticks'] }), type: 'parasite' })
    expect(treatment.title).toMatch(/^Блохи/)
    expect(treatment.details).toEqual([])
  })

  it('points a duplicate at the real record only when the server named it', () => {
    expect(entryRow(ru, vaccine({ duplicate: { record_id: 'r1', title: 'Вакцина, 3 марта 2024' } })).duplicate).toEqual({
      text: 'Уже есть в медкарте: Вакцина, 3 марта 2024',
      recordId: 'r1',
    })
    expect(entryRow(ru, vaccine({ duplicate: { record_id: null, title: null } })).duplicate).toEqual({
      text: 'Уже есть в медкарте',
      recordId: null,
    })
  })

  it('says a course by its days and how to give it', () => {
    expect(entryRow(ru, course()).date.text).toBe('С 12 ноября 2026 по 19 ноября 2026')
    expect(entryRow(ru, course({ end_date: null })).date.text).toBe('С 12 ноября 2026')
    expect(entryRow(ru, course()).details).toEqual(['1 таблетка утром'])
    const noStart = entryRow(ru, course({ start_date: null }))
    expect(noStart.date.missing).toBe(true)
    expect(noStart.missing).toEqual(['Нет даты начала — укажите её, чтобы добавить курс.'])
  })

  it('hands the checkbox the whole row at once, in English too', () => {
    expect(entryHint(entryRow(en, vaccine({ date: null })))).toBe('Date not recognised. Rabies. No date: add it to save this record.')
  })
})

describe('the edit of an entry', () => {
  it('opens a vaccination in the record form with its own values, the next date as written', () => {
    const draft = eventDraftOf(vaccine({ product_id: 'p1', targets: ['panleukopenia'], next_date: '2027-03-12' }))
    expect(draft).toMatchObject({ kind: 'vaccination', status: 'done', date: '12.03.2026' })
    expect(draft.items[0]).toMatchObject({ key: 'v', source: 'catalog', productId: 'p1', next: 'custom', nextText: '12.03.2027' })
  })

  it('suggests no next date the document does not have, and keeps an unread name out', () => {
    const item = eventDraftOf(vaccine({ name: null, targets: ['rabies'], date: null })).items[0]
    expect(item).toMatchObject({ source: 'none', name: '', next: 'none', nextText: '' })
    expect(eventDraftOf(vaccine({ name: null, targets: [], date: null })).date).toBe('')
  })

  it('reads the form back by its own rules: a day, a name, the next date; nothing unsure any more', () => {
    const entry = vaccine({ date: null, unsure: ['date'], next_date: '2027-03-12' })
    const draft = { ...eventDraftOf(entry), date: '12.03.2026' }
    const read = readDraft(ru, draft, 'new', NOW)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(entryFromEventRead(entry, read.value)).toMatchObject({
      date: '2026-03-12',
      name: 'Вакцина',
      targets: ['rabies'],
      next_date: '2027-03-12',
      unsure: [],
    })
  })

  it('refuses «Готово» without a day, as the record form does', () => {
    const read = readDraft(ru, eventDraftOf(vaccine({ date: null })), 'new', NOW)
    expect(read.ok).toBe(false)
  })

  it('opens a course in the medicine form and reads it back', () => {
    const entry = course({ dosage: null, unsure: ['dosage'] })
    const draft = courseDraftOf(entry)
    expect(draft).toEqual({ key: 'm', name: 'Препарат', dosage: '', start: '12.11.2026', end: '19.11.2026', ongoing: false })
    const read = readCourses(ru, [{ ...draft, dosage: 'по 1 таблетке' }])
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(entryFromCourseRead(entry, read.value[0])).toMatchObject({
      dosage: 'по 1 таблетке',
      start_date: '2026-11-12',
      end_date: '2026-11-19',
      unsure: [],
    })
  })

  it('knows whether anything was changed, for «Отмена»', () => {
    const state = editStateOf(vaccine())
    expect(editChanged(state, editStateOf(vaccine()))).toBe(false)
    if (state.form.kind !== 'event') throw new Error('an event')
    expect(editChanged(state, { ...state, form: { kind: 'event', draft: { ...state.form.draft, date: '13.03.2026' } } })).toBe(true)
  })

  it('ticks a checked entry, but leaves a possible duplicate to the owner', () => {
    expect(selectionAfterEdit({ v: false }, vaccine())).toEqual({ v: true })
    const duplicate = vaccine({ duplicate: { record_id: null, title: null } })
    expect(selectionAfterEdit({ v: false }, duplicate)).toEqual({ v: false })
    expect(selectionAfterEdit({ v: true }, duplicate)).toEqual({ v: true })
    expect(selectionAfterEdit({ v: true }, vaccine({ date: null }))).toEqual({ v: false })
  })
})

describe('the success', () => {
  it('says what was saved, a record per section, with no empty group', () => {
    expect(savedLines(ru, savedSummary(FIXTURE_SAVED_PASSPORT))).toEqual([
      { section: 'vaccinations', title: 'Прививки', count: 'Добавлена 1 запись' },
      { section: 'parasites', title: 'Обработки', count: 'Добавлена 1 запись' },
    ])
    expect(savedLines(ru, savedSummary(FIXTURE_SAVED_RECIPE))).toEqual([{ section: 'medications', title: 'Лекарства', count: 'Добавлен 1 курс' }])
  })
})

describe('the developer screen fixtures', () => {
  it('cover every state the server cannot give yet, each named', () => {
    for (const state of PREVIEW_STATES) expect(STATE_TITLES[state]).toBeTruthy()
    expect(PREVIEW_STATES).toEqual(
      expect.arrayContaining(['stored', 'paid', 'credits', 'recognizing', 'review', 'edit', 'mismatch', 'recipe', 'confirmed', 'vaccination', 'failed', 'nothing', 'discard']),
    )
  })

  it('open the review with the confident entries ticked and the rest not', () => {
    expect(initialSelection(FIXTURE_PASSPORT_DRAFT)).toEqual({ v1: true, v2: true, v3: false, v4: false, p1: true })
    expect(initialSelection(FIXTURE_RECIPE_DRAFT)).toEqual({ m1: true, m2: false })
  })
})
