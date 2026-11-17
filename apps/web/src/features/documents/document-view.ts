import { DOCUMENT_LIMITS, type DocumentKind, type PetDocument } from '@lapka/contracts'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import { recordDay } from '@/features/medical-record/view-model'

/** Where the pet's documents live on the site (DOC-1). */
export const documentHref = {
  list: (petId: string) => `/pets/${petId}/documents`,
  add: (petId: string) => `/pets/${petId}/documents/new`,
  view: (petId: string, docId: string) => `/pets/${petId}/documents/${docId}`,
  /**
   * The original, page by page. `from`: the screen it was opened from, to go
   * back to (the document's own page when left out).
   */
  original: (petId: string, docId: string, { page, from }: { page?: number; from?: string } = {}) => {
    const query = new URLSearchParams()
    if (page && page > 1) query.set('page', String(page))
    if (from && from !== documentHref.view(petId, docId)) query.set('from', from)
    const search = query.toString()
    return `/pets/${petId}/documents/${docId}/original${search ? `?${search}` : ''}`
  },
}

export type DocumentSaved = 'added' | 'changed' | 'deleted'

/** `?saved=` of the list and of a document's page, read strictly. */
export function parseDocumentSaved(value: string | string[] | undefined): DocumentSaved | null {
  return value === 'added' || value === 'changed' || value === 'deleted' ? value : null
}

/** The numbers of DOCUMENT_LIMITS put into a sentence: `{maxImages}`, `{imageMb}`, `{pdfMb}`, `{pdfPages}`, `{perPet}`. */
export function withLimits(text: string): string {
  const mb = (bytes: number) => String(Math.round(bytes / (1024 * 1024)))
  return text
    .replaceAll('{maxImages}', String(DOCUMENT_LIMITS.maxImages))
    .replaceAll('{imageMb}', mb(DOCUMENT_LIMITS.imageMaxBytes))
    .replaceAll('{pdfMb}', mb(DOCUMENT_LIMITS.pdfMaxBytes))
    .replaceAll('{pdfPages}', String(DOCUMENT_LIMITS.pdfMaxPages))
    .replaceAll('{perPet}', String(DOCUMENT_LIMITS.perPet))
}

/** A document's name on screen: its title, or its kind when it has none. */
export function documentTitle(dict: Dictionary, doc: Pick<PetDocument, 'title' | 'kind'>): string {
  return doc.title.trim() || dict.documents.kinds[doc.kind]
}

/**
 * Whether the kind is worth saying beside the name: not when the name is
 * the kind already — no title of its own, or one that reads as the kind
 * («Ветпаспорт» named «Ветпаспорт»).
 */
export function namesItsKind(dict: Dictionary, doc: Pick<PetDocument, 'title' | 'kind'>): boolean {
  const label = dict.documents.kinds[doc.kind]
  return documentTitle(dict, doc).trim().toLocaleLowerCase() === label.toLocaleLowerCase()
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
export function documentPages(dict: Dictionary, locale: Locale, doc: Pick<PetDocument, 'files' | 'page_count'>): string | null {
  const count = documentPageCount(doc)
  return count === null ? null : formatCount(dict.documents.pages, count, locale)
}

/**
 * The status worth a word in the list. A stored document says nothing — it
 * is simply there; the others come with recognition (DOC-2).
 */
export function documentStatus(dict: Dictionary, doc: Pick<PetDocument, 'status'>): string | null {
  switch (doc.status) {
    case 'recognizing':
    case 'review':
    case 'confirmed':
    case 'failed':
      return dict.documents.status[doc.status]
    default:
      return null
  }
}

/** A row of the list: the name, a line of facts, the status in words, PDF or photos. */
export type DocumentRowView = { title: string; meta: string; status: string | null; format: DocumentFormat }

/**
 * The kind (unless the name already is the kind), the document's date when
 * it has one, and the pages: «Рецепт · 12 ноября · 1 страница».
 */
export function documentRow(dict: Dictionary, locale: Locale, doc: PetDocument, today: string): DocumentRowView {
  const words = dict.documents
  const parts = [
    namesItsKind(dict, doc) ? null : words.kinds[doc.kind],
    doc.document_date ? recordDay(dict.medicalRecord, doc.document_date, today) : null,
    documentPages(dict, locale, doc),
  ]
  return {
    title: documentTitle(dict, doc),
    meta: parts.filter(Boolean).join(' · '),
    status: documentStatus(dict, doc),
    format: documentFormat(doc),
  }
}

/**
 * Under a document's title: «Ветпаспорт · 4 страницы», or only «4 страницы»
 * when the title is the kind; «PDF» when that leaves nothing to say.
 */
export function documentHeadline(dict: Dictionary, locale: Locale, doc: PetDocument): string {
  const kind = namesItsKind(dict, doc) ? null : dict.documents.kinds[doc.kind]
  const line = [kind, documentPages(dict, locale, doc)].filter(Boolean).join(' · ')
  return line || dict.documents.format[documentFormat(doc)]
}

/** The kinds that are only kept and opened in this plan (no recognition is offered for them). */
export function isArchiveKind(kind: DocumentKind): kind is 'discharge' | 'lab_results' | 'other' {
  return kind === 'discharge' || kind === 'lab_results' || kind === 'other'
}

/** Where the original goes back to, and what its button says. */
export type OriginalReturn = { href: string; to: 'document' | 'list' | 'back' }

/**
 * The screen the original was opened from (`?from=`), if it is a page of
 * this pet on this site; the document's own page otherwise. Anything else —
 * another site, another pet, a protocol-relative link — is ignored, so the
 * parameter cannot send the owner away.
 */
export function originalReturn(petId: string, docId: string, from: string | string[] | undefined): OriginalReturn {
  const view = documentHref.view(petId, docId)
  const list = documentHref.list(petId)
  const value = typeof from === 'string' ? from : null
  const safe =
    value !== null &&
    value.startsWith(`/pets/${petId}/`) &&
    !value.includes('//') &&
    !value.includes('\\') &&
    !value.includes('/original') &&
    /^[A-Za-z0-9/_\-?=&%.]+$/.test(value)
  if (!safe) return { href: view, to: 'document' }
  const path = value.split('?')[0]
  if (path === view) return { href: value, to: 'document' }
  if (path === list) return { href: value, to: 'list' }
  return { href: value, to: 'back' }
}

/** `?page=` of the original: a page that exists, the first one otherwise. */
export function originalPage(value: string | string[] | undefined, total: number): number {
  const n = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : 1
  return Math.min(Math.max(n, 1), Math.max(total, 1))
}
