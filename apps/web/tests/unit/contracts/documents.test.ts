import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_LIMITS,
  DocumentCreateInputSchema,
  DocumentListSchema,
  DocumentPatchSchema,
  HealthOverviewReadSchema,
  PetDocumentSchema,
} from '@lapka/contracts'

const MB = 1024 * 1024
const image = (overrides: Record<string, unknown> = {}) => ({ content_type: 'image/jpeg', size_bytes: 400_000, ...overrides })
const pdf = (overrides: Record<string, unknown> = {}) => ({ content_type: 'application/pdf', size_bytes: 2 * MB, ...overrides })
const create = (files: unknown[]) => DocumentCreateInputSchema.safeParse({ kind: 'vet_passport', files })

const pet = {
  id: '11111111-1111-4111-8111-000000000002',
  species: 'dog',
  name: 'Рекс',
  breed: 'labrador',
  age_years: 3,
  weight_kg: 28,
  sex: 'male',
  neutered: false,
  indoor_outdoor: null,
  diet: null,
  size_class: 'large',
  walk_activity: 'daily_long',
  allergies: [],
  vaccinated: null,
  chronic_conditions: [],
  medications: [],
  notes: null,
  birth_date: '2023-03-14',
  birth_date_approx: false,
  adopted_on: null,
  avatar_url: null,
  created_at: '2026-05-01T10:00:00.000Z',
}

describe('document create input', () => {
  it('accepts 1..8 images or one pdf', () => {
    expect(create([image()]).success).toBe(true)
    expect(create(Array.from({ length: 8 }, () => image())).success).toBe(true)
    expect(create([pdf()]).success).toBe(true)
  })

  it('refuses mixed images and pdf', () => {
    expect(create([image(), pdf()]).success).toBe(false)
  })

  it('refuses two pdfs and no files', () => {
    expect(create([pdf(), pdf()]).success).toBe(false)
    expect(create([]).success).toBe(false)
  })

  it('refuses 9 images', () => {
    expect(create(Array.from({ length: 9 }, () => image())).success).toBe(false)
  })

  it('refuses pdf over 10 MB and image over 5 MB', () => {
    expect(create([pdf({ size_bytes: DOCUMENT_LIMITS.pdfMaxBytes })]).success).toBe(true)
    expect(create([pdf({ size_bytes: DOCUMENT_LIMITS.pdfMaxBytes + 1 })]).success).toBe(false)
    expect(create([image({ size_bytes: DOCUMENT_LIMITS.imageMaxBytes })]).success).toBe(true)
    expect(create([image({ size_bytes: DOCUMENT_LIMITS.imageMaxBytes + 1 })]).success).toBe(false)
  })

  it('refuses an unknown kind, a content type, a long title', () => {
    expect(DocumentCreateInputSchema.safeParse({ kind: 'xray', files: [image()] }).success).toBe(false)
    expect(create([image({ content_type: 'image/gif' })]).success).toBe(false)
    expect(DocumentCreateInputSchema.safeParse({ kind: 'other', title: 'я'.repeat(101), files: [image()] }).success).toBe(false)
  })
})

describe('document patch', () => {
  it('patch needs a field', () => {
    expect(DocumentPatchSchema.safeParse({}).success).toBe(false)
    expect(DocumentPatchSchema.safeParse({ title: 'Паспорт' }).success).toBe(true)
    expect(DocumentPatchSchema.safeParse({ document_date: null }).success).toBe(true)
  })
})

describe('document read shapes', () => {
  const document = {
    id: '11111111-1111-4111-8111-0000000000d1',
    kind: 'vet_passport',
    title: 'Паспорт',
    document_date: null,
    status: 'stored',
    failure_code: null,
    page_count: 2,
    created_at: '2026-11-13T10:00:00Z',
    files: [{ id: '11111111-1111-4111-8111-0000000000f1', content_type: 'image/jpeg', url: 'https://example.com/a', page_count: null }],
  }

  it('reads a document with no draft and ignores a field a later server adds', () => {
    expect(PetDocumentSchema.parse({ ...document, later: 1 }).draft).toBeNull()
  })

  it('reads the list with the free recognitions left', () => {
    expect(DocumentListSchema.safeParse({ documents: [document], free_recognitions_left: 3, recognition_price: 0 }).success).toBe(true)
    expect(DocumentListSchema.safeParse({ documents: [], free_recognitions_left: 0, recognition_price: 2 }).success).toBe(false)
  })
})

describe('overview and the documents section', () => {
  it('overview drops an unknown writable section', () => {
    const overview = HealthOverviewReadSchema.parse({ pet, writable: ['vaccinations', 'xrays'] }) as { writable: string[] }
    expect(overview.writable).toEqual(['vaccinations'])
  })

  it('old overview without documents parses', () => {
    const overview = HealthOverviewReadSchema.parse({ pet, writable: ['vaccinations', 'weight'] }) as { writable: string[] }
    expect(overview.writable).toEqual(['vaccinations', 'weight'])
  })

  it('keeps documents when the server lists it', () => {
    const overview = HealthOverviewReadSchema.parse({ pet, writable: ['documents'] }) as { writable: string[] }
    expect(overview.writable).toEqual(['documents'])
  })
})
