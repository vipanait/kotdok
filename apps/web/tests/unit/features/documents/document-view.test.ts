import { describe, expect, it } from 'vitest'
import type { PetDocument } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { documentHeadline, documentHref, documentRow, isArchiveKind, originalPage, originalReturn, withLimits } from '@/features/documents/document-view'

const PET = '11111111-1111-4111-8111-000000000001'
const OTHER_PET = '11111111-1111-4111-8111-000000000009'
const DOC = '22222222-2222-4222-8222-000000000002'
const TODAY = '2026-11-17'

function file(contentType: PetDocument['files'][number]['content_type'], pageCount: number | null = null, n = 0): PetDocument['files'][number] {
  return { id: `33333333-3333-4333-8333-00000000000${n}`, content_type: contentType, url: `https://storage.example/${n}`, page_count: pageCount }
}

function doc(overrides: Partial<PetDocument> = {}): PetDocument {
  return {
    id: DOC,
    kind: 'vet_passport',
    title: '',
    document_date: null,
    status: 'stored',
    failure_code: null,
    page_count: null,
    created_at: '2026-11-10T10:00:00.000Z',
    files: [file('image/jpeg', null, 0), file('image/jpeg', null, 1), file('image/jpeg', null, 2), file('image/jpeg', null, 3)],
    draft: null,
    ...overrides,
  }
}

describe('documentRow', () => {
  it('names an untitled document by its kind once, with its pages and no status while it is simply stored', () => {
    expect(documentRow(ru, 'ru', doc(), TODAY)).toEqual({ title: 'Ветпаспорт', meta: '4 страницы', status: null, format: 'photo' })
  })

  it('gives a titled document its kind, its own date when it has one, and the PDF’s page count', () => {
    const row = documentRow(ru, 'ru', doc({ kind: 'prescription', title: 'Назначение от 12 ноября', document_date: '2026-11-12', files: [file('application/pdf', 1)], page_count: 1 }), TODAY)
    expect(row).toEqual({ title: 'Назначение от 12 ноября', meta: 'Рецепт · 12 ноября · 1 страница', status: null, format: 'pdf' })
  })

  it('leaves out the pages of a PDF not counted yet rather than guessing', () => {
    expect(documentRow(ru, 'ru', doc({ files: [file('application/pdf')] }), TODAY).meta).toBe('')
  })

  it('says a meaningful status in words, not by colour', () => {
    expect(documentRow(ru, 'ru', doc({ status: 'review' }), TODAY).status).toBe('Ждёт проверки')
    expect(documentRow(ru, 'ru', doc({ status: 'pending' }), TODAY).status).toBeNull()
    expect(documentRow(en, 'en', doc({ status: 'failed' }), TODAY).status).toBe('Could not be read')
  })
})

describe('documentHeadline', () => {
  it('is the kind and the pages under the title', () => {
    expect(documentHeadline(ru, 'ru', doc({ title: 'Ветпаспорт Мурки' }))).toBe('Ветпаспорт · 4 страницы')
    expect(documentHeadline(en, 'en', doc({ kind: 'lab_results', files: [file('application/pdf', 2)] }))).toBe('Lab results · 2 pages')
  })
})

describe('isArchiveKind', () => {
  it('is every kind but the passport and the prescription', () => {
    expect(['vet_passport', 'prescription', 'discharge', 'lab_results', 'other'].filter((kind) => isArchiveKind(kind as PetDocument['kind']))).toEqual([
      'discharge',
      'lab_results',
      'other',
    ])
  })
})

describe('withLimits', () => {
  it('fills the limits from the contract', () => {
    expect(withLimits(ru.documents.upload.limits)).toBe('До 8 фото или один PDF. Каждое фото до 5 МБ, PDF до 10 МБ и 10 страниц.')
  })
})

describe('the original', () => {
  const view = documentHref.view(PET, DOC)

  it('goes back to the document by default', () => {
    expect(originalReturn(PET, DOC, undefined)).toEqual({ href: view, to: 'document' })
    expect(documentHref.original(PET, DOC, { from: view })).toBe(`${view}/original`)
  })

  it('goes back to a page of this pet it was opened from', () => {
    const list = documentHref.list(PET)
    expect(originalReturn(PET, DOC, list)).toEqual({ href: list, to: 'list' })
    const review = `/pets/${PET}/documents/${DOC}/review?item=3`
    expect(originalReturn(PET, DOC, review)).toEqual({ href: review, to: 'back' })
    expect(documentHref.original(PET, DOC, { page: 2, from: list })).toBe(`${view}/original?page=2&from=${encodeURIComponent(list)}`)
  })

  it('never leaves the pet’s pages through ?from=', () => {
    for (const from of ['https://evil.example', '//evil.example/x', `/pets/${OTHER_PET}/documents`, `/pets/${PET}/\\evil`, `/pets/${PET}//evil`, ['a', 'b'], `${view}/original`]) {
      expect(originalReturn(PET, DOC, from)).toEqual({ href: view, to: 'document' })
    }
  })

  it('opens a page that exists', () => {
    expect(originalPage(undefined, 4)).toBe(1)
    expect(originalPage('3', 4)).toBe(3)
    expect(originalPage('9', 4)).toBe(4)
    expect(originalPage('0', 4)).toBe(1)
    expect(originalPage('2x', 4)).toBe(1)
  })
})
