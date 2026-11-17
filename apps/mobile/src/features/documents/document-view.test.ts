import { describe, expect, it } from 'vitest'
import type { PetDocument } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import {
  documentHeadline,
  documentPageCount,
  documentRoute,
  documentRow,
  documentStatus,
  isArchiveKind,
  limitsText,
  listFull,
  listSubtitle,
  originalBackTitle,
  originalPage,
  pdfOpening,
  readDetails,
} from './document-view'

const TODAY = '2026-11-17'

function doc(overrides: Partial<PetDocument> = {}): PetDocument {
  return {
    id: '22222222-2222-4222-8222-000000000002',
    kind: 'vet_passport',
    title: 'Ветпаспорт Мурки',
    document_date: null,
    status: 'stored',
    failure_code: null,
    page_count: null,
    created_at: '2026-11-16T10:00:00.000Z',
    files: [
      { id: '33333333-3333-4333-8333-000000000001', content_type: 'image/jpeg', url: 'https://s/1', page_count: null },
      { id: '33333333-3333-4333-8333-000000000002', content_type: 'image/jpeg', url: 'https://s/2', page_count: null },
    ],
    draft: null,
    ...overrides,
  }
}

const pdf = (pages: number | null) =>
  doc({ kind: 'prescription', title: '', files: [{ id: '33333333-3333-4333-8333-000000000003', content_type: 'application/pdf', url: 'https://s/p', page_count: pages }] })

describe('a document row', () => {
  it('says the kind, the pages and no status for a stored photo document', () => {
    expect(documentRow(ru, doc(), TODAY)).toEqual({
      title: 'Ветпаспорт Мурки',
      meta: 'Ветпаспорт · 2 страницы',
      status: null,
      format: 'photo',
      label: 'Ветпаспорт Мурки, Ветпаспорт · 2 страницы, ФОТО',
    })
  })

  it('does not repeat the kind when the document is named after it, and adds its own date', () => {
    const row = documentRow(ru, { ...pdf(1), document_date: '2026-11-12' }, TODAY)
    expect(row.title).toBe('Рецепт')
    expect(row.meta).toBe('12 ноября · 1 страница')
    expect(row.format).toBe('pdf')
  })

  it('writes the year of a date from another year', () => {
    expect(documentRow(ru, doc({ document_date: '2025-03-01' }), TODAY).meta).toBe('Ветпаспорт · 1 марта 2025 · 2 страницы')
  })

  it('leaves the pages out for a PDF the server has not counted', () => {
    expect(documentRow(ru, pdf(null), TODAY).meta).toBe('')
    expect(documentPageCount(pdf(null))).toBeNull()
    expect(documentPageCount({ ...pdf(null), page_count: 4 })).toBe(4)
  })

  it('names a status in words only when there is one worth saying', () => {
    expect(documentStatus(ru, { status: 'pending' })).toBeNull()
    expect(documentStatus(ru, { status: 'stored' })).toBeNull()
    expect(documentStatus(ru, { status: 'review' })).toBe('Ждёт проверки')
    expect(documentStatus(en, { status: 'failed' })).toBe('Could not be read')
  })

  it('heads a document with its kind and pages', () => {
    expect(documentHeadline(ru, doc())).toBe('Ветпаспорт · 2 страницы')
  })
})

describe('the list head', () => {
  it('says the pet once, with the count when there are documents', () => {
    expect(listSubtitle(ru, 'Мурка', 3)).toBe('Мурка · 3 документа')
    expect(listSubtitle(ru, 'Мурка', 0)).toBe('Мурка')
    expect(listSubtitle(ru, null, 5)).toBe('5 документов')
    expect(listSubtitle(ru, null, null)).toBeNull()
  })

  it('is full at the per-pet limit', () => {
    expect(listFull(29)).toBe(false)
    expect(listFull(30)).toBe(true)
  })
})

describe('kinds', () => {
  it('keeps only the passport and the prescription out of the archive kinds', () => {
    expect(isArchiveKind('vet_passport')).toBe(false)
    expect(isArchiveKind('prescription')).toBe(false)
    expect(isArchiveKind('lab_results')).toBe(true)
    expect(isArchiveKind('discharge')).toBe(true)
    expect(isArchiveKind('other')).toBe(true)
  })
})

describe('the original', () => {
  it('names the screen it goes back to', () => {
    expect(originalBackTitle(ru, 'document')).toBe('К документу')
    expect(originalBackTitle(ru, undefined)).toBe('К документу')
    expect(originalBackTitle(ru, 'list')).toBe('К документам')
    expect(originalBackTitle(ru, 'review')).toBe('К проверке')
    expect(originalBackTitle(ru, 'edit')).toBe('К правке')
    expect(originalBackTitle(en, 'review')).toBe('To the review')
    expect(originalBackTitle(ru, 'somewhere')).toBe('Назад')
    expect(originalBackTitle(ru, ['list', 'x'])).toBe('Назад')
  })

  it('opens a page that exists', () => {
    expect(originalPage(undefined, 4)).toBe(1)
    expect(originalPage('3', 4)).toBe(3)
    expect(originalPage('9', 4)).toBe(4)
    expect(originalPage('0', 4)).toBe(1)
    expect(originalPage('-2', 4)).toBe(1)
    expect(originalPage('2', 0)).toBe(1)
  })

  it('carries the page and the opener in its route', () => {
    expect(documentRoute.original('p', 'd')).toBe('/pets/p/documents/d/original')
    expect(documentRoute.original('p', 'd', { page: 1, from: 'document' })).toBe('/pets/p/documents/d/original?from=document')
    expect(documentRoute.original('p', 'd', { page: 3, from: 'list' })).toBe('/pets/p/documents/d/original?page=3&from=list')
  })
})

describe('the limits sentence', () => {
  it('mentions a PDF only when this build can pick one', () => {
    expect(limitsText(ru, true)).toBe('До 8 фото или один PDF. Каждое фото до 5 МБ, PDF до 10 МБ и 10 страниц.')
    expect(limitsText(ru, false)).toBe('До 8 фото, каждое до 5 МБ.')
  })
})

describe('«Название и дата»', () => {
  const untitled = { title: '', document_date: null }
  const named = { title: 'Ветпаспорт Мурки', document_date: '2026-03-12' }

  it('lets a document saved without a name get a date, and keeps it unnamed', () => {
    expect(readDetails(untitled, '', '2026-03-12')).toEqual({ ok: true, patch: { document_date: '2026-03-12' } })
  })

  it('asks for a name only when the document already had one', () => {
    expect(readDetails(named, '   ', '2026-03-12')).toEqual({ ok: false, title: 'required', date: false })
  })

  it('sends only what changed, and a cleared date as null', () => {
    expect(readDetails(named, ' Ветпаспорт Мурки ', '2026-03-12')).toEqual({ ok: true, patch: {} })
    expect(readDetails(named, 'Паспорт', null)).toEqual({ ok: true, patch: { title: 'Паспорт', document_date: null } })
    expect(readDetails(untitled, 'Рецепт', null)).toEqual({ ok: true, patch: { title: 'Рецепт' } })
  })

  it('refuses a name over the limit and a date that does not read', () => {
    expect(readDetails(named, 'я'.repeat(101), '2026-03-12')).toEqual({ ok: false, title: 'tooLong', date: false })
    expect(readDetails(named, 'Паспорт', 'invalid')).toEqual({ ok: false, title: null, date: true })
  })
})

describe('a stored PDF', () => {
  it('is viewed on iOS and downloaded on Android, where Chrome does not show it', () => {
    expect(pdfOpening('ios')).toBe('view')
    expect(pdfOpening('android')).toBe('download')
  })
})
