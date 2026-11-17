import { DOCUMENT_LIMITS, type DocumentKind, type PetDocument } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'

/**
 * What the documents screens say about a document (DOC-1), worked out apart
 * from the screens so it is tested without a simulator. The same rules as the
 * site's `apps/web/src/features/documents/document-view.ts`, in the app's
 * words.
 */

/** Where the pet's documents live in the app. */
export const documentRoute = {
  list: (petId: string) => `/pets/${petId}/documents`,
  add: (petId: string) => `/pets/${petId}/documents/new`,
  view: (petId: string, docId: string) => `/pets/${petId}/documents/${docId}`,
  /** The original, page by page; `from` names the screen it was opened from, for the button that goes back to it. */
  original: (petId: string, docId: string, { page, from }: { page?: number; from?: OriginalOpener } = {}) => {
    const query = [page && page > 1 ? `page=${page}` : null, from ? `from=${from}` : null].filter(Boolean).join('&')
    return `/pets/${petId}/documents/${docId}/original${query ? `?${query}` : ''}`
  },
}

/** A document's name on screen: its title, or its kind when it has none. */
export function documentTitle(t: Dictionary, doc: Pick<PetDocument, 'title' | 'kind'>): string {
  return doc.title.trim() || t.documents.kinds[doc.kind]
}

export type DocumentFormat = 'pdf' | 'photo'

/** One PDF, or photos of pages. */
export function documentFormat(doc: Pick<PetDocument, 'files'>): DocumentFormat {
  return doc.files.some((file) => file.content_type === 'application/pdf') ? 'pdf' : 'photo'
}

/** How many pages: one per photo; a PDF's own count once the server has read it, else unknown. */
export function documentPageCount(doc: Pick<PetDocument, 'files' | 'page_count'>): number | null {
  if (documentFormat(doc) === 'photo') return doc.files.length
  return doc.page_count ?? doc.files[0]?.page_count ?? null
}

/** «4 страницы»; nothing for a PDF whose pages are not counted yet. */
export function documentPages(t: Dictionary, doc: Pick<PetDocument, 'files' | 'page_count'>): string | null {
  const count = documentPageCount(doc)
  return count === null ? null : t.documents.pages(count)
}

/**
 * The status worth a word in the list. A stored document says nothing — it
 * is simply there (a status this build does not know is read as stored, see
 * `readableDocument`); the others come with recognition (DOC-2).
 */
export function documentStatus(t: Dictionary, doc: Pick<PetDocument, 'status'>): string | null {
  switch (doc.status) {
    case 'recognizing':
    case 'review':
    case 'confirmed':
    case 'failed':
      return t.documents.status[doc.status]
    default:
      return null
  }
}

/** «12 ноября» this year, «12 ноября 2025» another. */
function documentDay(t: Dictionary, day: string, today: string): string {
  return t.day(day, day.slice(0, 4) !== today.slice(0, 4))
}

/** A row of the list: the name, a line of facts, the status in words, PDF or photos. */
export type DocumentRowView = { title: string; meta: string; status: string | null; format: DocumentFormat; label: string }

/**
 * The kind (unless the name already is the kind), the document's date when
 * it has one, and the pages: «Рецепт · 12 ноября · 1 страница». `label` is
 * the whole row said at once, for a screen reader.
 */
export function documentRow(t: Dictionary, doc: PetDocument, today: string): DocumentRowView {
  const parts = [
    doc.title.trim() ? t.documents.kinds[doc.kind] : null,
    doc.document_date ? documentDay(t, doc.document_date, today) : null,
    documentPages(t, doc),
  ]
  const title = documentTitle(t, doc)
  const meta = parts.filter(Boolean).join(' · ')
  const status = documentStatus(t, doc)
  const format = documentFormat(doc)
  return { title, meta, status, format, label: [title, meta, status, t.documents.format[format]].filter(Boolean).join(', ') }
}

/** Under a document's title: «Ветпаспорт · 4 страницы». */
export function documentHeadline(t: Dictionary, doc: PetDocument): string {
  return [t.documents.kinds[doc.kind], documentPages(t, doc)].filter(Boolean).join(' · ')
}

/** «Мурка · 3 документа» under the list's title; the name alone while there are none. */
export function listSubtitle(t: Dictionary, petName: string | null, count: number | null): string | null {
  const parts = [petName, count ? t.documents.count(count) : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** A pet keeps up to `perPet` documents; at that many, «Добавить документ» is gone and the list says why. */
export function listFull(count: number): boolean {
  return count >= DOCUMENT_LIMITS.perPet
}

/** The kinds that are only kept and opened in this plan (no recognition is offered for them). */
export function isArchiveKind(kind: DocumentKind): kind is 'discharge' | 'lab_results' | 'other' {
  return kind === 'discharge' || kind === 'lab_results' || kind === 'other'
}

/** The screens the original is opened from, for the button at its bottom: the review of a recognised document and its edit too. */
export type OriginalOpener = 'document' | 'list' | 'review' | 'edit'

/**
 * What the original's bottom button says. The original is pushed over the
 * screen that opened it, so going back always returns there; `from` only
 * names it. Anything this build does not know says «Назад».
 */
export function originalBackTitle(t: Dictionary, from: string | string[] | undefined): string {
  if (from === 'list') return t.documents.original.toList
  if (from === 'review') return t.documents.original.toReview
  if (from === 'edit') return t.documents.original.toEdit
  if (from === 'document' || from === undefined) return t.documents.original.toDocument
  return t.documents.original.back
}

/** `?page=` of the original: a page that exists, the first one otherwise. */
export function originalPage(value: string | string[] | undefined, total: number): number {
  const n = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : 1
  return Math.min(Math.max(n, 1), Math.max(total, 1))
}

/** Whole megabytes, as the limits are said. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}

/** The limits sentence on «Добавить документ», with PDF only when this build can pick one. */
export function limitsText(t: Dictionary, pdf: boolean): string {
  const words = t.documents.upload
  const imageMb = megabytes(DOCUMENT_LIMITS.imageMaxBytes)
  return pdf
    ? words.limits(DOCUMENT_LIMITS.maxImages, imageMb, megabytes(DOCUMENT_LIMITS.pdfMaxBytes), DOCUMENT_LIMITS.pdfMaxPages)
    : words.limitsNoPdf(DOCUMENT_LIMITS.maxImages, imageMb)
}
