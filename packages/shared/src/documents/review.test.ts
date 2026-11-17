import { describe, expect, it } from 'vitest'
import { HealthEventInputSchema, MedicationsInputSchema } from '@lapka/contracts'
import {
  canSelect,
  confirmBody,
  currentEntry,
  initialSelection,
  missingFields,
  petNameMismatch,
  reviewGroups,
  savedMerged,
  savedSummary,
  selectedCount,
  settleSelection,
  type DraftEntry,
  type DraftEventEntry,
  type DraftMedicationEntry,
  type RecognitionDraft,
} from './review'

const PRODUCT = '11111111-1111-4111-8111-111111111111'
const TODAY = '2026-11-17'

function vaccine(key: string, extra: Partial<DraftEventEntry> = {}): DraftEventEntry {
  return {
    key,
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
  }
}

function course(key: string, extra: Partial<DraftMedicationEntry> = {}): DraftMedicationEntry {
  return {
    key,
    type: 'medication',
    page: 1,
    name: 'Синулокс',
    dosage: '1 таблетка 2 раза в день',
    start_date: '2026-11-12',
    end_date: '2026-11-19',
    unsure: [],
    duplicate: null,
    selected_by_default: true,
    ...extra,
  }
}

const draft = (entries: DraftEntry[]): RecognitionDraft => ({ pet_name_as_written: null, document_date: null, clinic: 'Ветклиника', entries })

describe('initialSelection', () => {
  it('confident entries start selected', () => {
    expect(initialSelection(draft([vaccine('a'), course('b')]))).toEqual({ a: true, b: true })
  })

  it('unsure and duplicate start unselected', () => {
    const entries = [
      vaccine('unsure', { unsure: ['name'] }),
      vaccine('dup', { duplicate: { record_id: PRODUCT, title: 'Нобивак Rabies' } }),
      vaccine('notSuggested', { selected_by_default: false }),
    ]
    expect(initialSelection(draft(entries))).toEqual({ unsure: false, dup: false, notSuggested: false })
  })

  it('an entry the server suggests but that misses its date is not selected', () => {
    expect(initialSelection(draft([vaccine('a', { date: null })]))).toEqual({ a: false })
  })
})

describe('canSelect', () => {
  it('an entry without date cannot be selected', () => {
    expect(canSelect(vaccine('a', { date: null }))).toBe(false)
    expect(missingFields(vaccine('a', { date: '' }))).toEqual(['date'])
  })

  it('an entry with neither a name nor a target cannot be selected', () => {
    expect(missingFields(vaccine('a', { name: null, targets: [] }))).toEqual(['name'])
    // Targets alone are a record («Без препарата»).
    expect(canSelect(vaccine('a', { name: null, targets: ['rabies'] }))).toBe(true)
  })

  it('a course needs its name and start', () => {
    expect(missingFields(course('a', { name: ' ', start_date: null }))).toEqual(['name', 'start_date'])
    expect(canSelect(course('a', { end_date: null, dosage: null }))).toBe(true)
  })
})

describe('selectedCount and settleSelection', () => {
  it('counts only ticked entries that can be saved', () => {
    const d = draft([vaccine('a'), vaccine('b', { date: null }), course('c')])
    expect(selectedCount(d, {}, { a: true, b: true, c: false })).toBe(1)
  })

  it('an edit that fills the missing date makes the entry count', () => {
    const d = draft([vaccine('b', { date: null })])
    const edits = { b: vaccine('b', { date: '2026-03-01' }) }
    expect(selectedCount(d, edits, { b: true })).toBe(1)
  })

  it('an edit that removes a required field unticks the entry', () => {
    const d = draft([vaccine('a')])
    expect(settleSelection(d, { a: vaccine('a', { date: null }) }, { a: true })).toEqual({ a: false })
  })

  it('an edit keeps the entry key and page', () => {
    const edited = currentEntry(vaccine('a'), { a: vaccine('other', { page: 9, name: 'Другое' }) })
    expect(edited).toMatchObject({ key: 'a', page: 2, name: 'Другое' })
  })
})

describe('confirmBody', () => {
  it('only selected entries are sent', () => {
    const body = confirmBody(draft([vaccine('a'), vaccine('b'), course('c')]), {}, { a: true, b: false, c: true }, TODAY)
    expect(body.entries.map((entry) => entry.key)).toEqual(['a', 'c'])
  })

  it('edits replace draft values in the body', () => {
    const d = draft([vaccine('a', { name: '«Мульти…»', product_id: null, unsure: ['name'] })])
    const edits = { a: vaccine('a', { name: 'Мультикан-8', product_id: null, targets: ['rabies'] }) }
    const body = confirmBody(d, edits, { a: true }, TODAY)
    expect(body.entries[0]).toEqual({
      key: 'a',
      type: 'event',
      event: {
        kind: 'vaccination',
        status: 'done',
        date: '2026-03-12',
        clinic: 'Ветклиника',
        items: [{ name: 'Мультикан-8', targets: ['rabies'], product_id: null, next_on: '2027-03-12' }],
      },
    })
  })

  it('bodies are what the medical record contracts accept', () => {
    const body = confirmBody(draft([vaccine('a'), course('c')]), {}, { a: true, c: true }, TODAY)
    for (const entry of body.entries) {
      if (entry.type === 'event') expect(HealthEventInputSchema.safeParse(entry.event).success).toBe(true)
      else expect(MedicationsInputSchema.safeParse({ items: [entry.medication] }).success).toBe(true)
    }
  })

  it('a next date in the past or not after the record is not sent', () => {
    const past = confirmBody(draft([vaccine('a', { date: '2024-03-03', next_date: '2025-03-03' })]), {}, { a: true }, TODAY)
    expect(past.entries[0].type === 'event' && 'next_on' in past.entries[0].event.items[0]).toBe(false)
    const before = confirmBody(draft([vaccine('a', { next_date: '2026-03-12' })]), {}, { a: true }, TODAY)
    expect(before.entries[0].type === 'event' && 'next_on' in before.entries[0].event.items[0]).toBe(false)
  })

  it('the clinic the owner typed replaces the document one; empty is none', () => {
    expect(confirmBody(draft([vaccine('a')]), {}, { a: true }, TODAY, '  ').clinic).toBeNull()
  })

  it('a course goes in the shape of a medication input', () => {
    const body = confirmBody(draft([course('c', { dosage: ' ', end_date: null })]), {}, { c: true }, TODAY)
    expect(body.entries[0]).toEqual({
      key: 'c',
      type: 'medication',
      medication: { name: 'Синулокс', dosage: null, started_on: '2026-11-12', ended_on: null },
    })
  })
})

describe('savedSummary', () => {
  it('two vaccines saved as one record are one record of two items', () => {
    const groups = savedSummary({
      events: [
        { kind: 'vaccination', status: 'done', items: [{}, {}] },
        { kind: 'vaccination', status: 'planned', items: [{}, {}] },
        { kind: 'parasite', status: 'done', items: [{}] },
      ],
      medications: [],
    })
    expect(groups).toEqual([
      { section: 'vaccinations', records: 1, items: 2 },
      { section: 'parasites', records: 1, items: 1 },
    ])
    expect(savedMerged(groups)).toBe(true)
  })

  it('a prescription shows only medicines, no empty groups', () => {
    const groups = savedSummary({ events: [], medications: [{ id: 'x' }] })
    expect(groups).toEqual([{ section: 'medications', records: 1, items: 1 }])
    expect(savedMerged(groups)).toBe(false)
  })
})

describe('reviewGroups', () => {
  it('keeps the screen order and leaves out empty groups', () => {
    const groups = reviewGroups([course('c'), vaccine('a')])
    expect(groups.map((group) => group.section)).toEqual(['vaccinations', 'medications'])
  })
})

describe('petNameMismatch', () => {
  it('warns about another name, not about case, spaces or ё', () => {
    expect(petNameMismatch('Барсик', 'Мурка')).toBe(true)
    expect(petNameMismatch(' мурка ', 'Мурка')).toBe(false)
    expect(petNameMismatch('Алёна', 'Алена')).toBe(false)
    expect(petNameMismatch(null, 'Мурка')).toBe(false)
  })
})
