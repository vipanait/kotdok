import type { PetDocument } from '@lapka/contracts'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import { recordDay } from '@/features/medical-record/view-model'
import { checkDayOf } from '@/features/medical-record/visits/visit-view'

/** Where the pet's documents live on the site (DOC-1). */
export const documentHref = {
  list: (petId: string) => `/pets/${petId}/documents`,
  add: (petId: string) => `/pets/${petId}/documents/new`,
  view: (petId: string, docId: string) => `/pets/${petId}/documents/${docId}`,
}

export type DocumentSaved = 'added' | 'changed' | 'deleted'

/** `?saved=` of the list and of a document's page, read strictly. */
export function parseDocumentSaved(value: string | string[] | undefined): DocumentSaved | null {
  return value === 'added' || value === 'changed' || value === 'deleted' ? value : null
}

/** A document's name on screen: its title, or its kind when it has none. */
export function documentTitle(dict: Dictionary, doc: Pick<PetDocument, 'title' | 'kind'>): string {
  return doc.title.trim() || dict.documents.kinds[doc.kind]
}

/** «PDF, 3 страницы», «2 страницы»: what the document holds. */
export function documentPages(dict: Dictionary, locale: Locale, doc: Pick<PetDocument, 'files' | 'page_count'>): string {
  const words = dict.documents
  const isPdf = doc.files.some((file) => file.content_type === 'application/pdf')
  const count = doc.page_count ?? (isPdf ? null : doc.files.length)
  if (count === null) return words.pdf
  return formatCount(isPdf ? words.pdfPages : words.pages, count, locale)
}

/**
 * The line under a document's name: its kind (when it has a title of its
 * own), its date or the day it was added, what it holds, and «Ждёт
 * проверки» while a recognition waits for the owner (DOC-2).
 */
export function documentMeta(dict: Dictionary, locale: Locale, doc: PetDocument, today: string): string {
  const words = dict.documents
  const parts = [
    doc.title.trim() ? words.kinds[doc.kind] : null,
    doc.document_date
      ? recordDay(dict.medicalRecord, doc.document_date, today)
      : words.added.replace('{day}', recordDay(dict.medicalRecord, checkDayOf(doc.created_at), today)),
    documentPages(dict, locale, doc),
    doc.status === 'review' ? words.inReview : null,
  ]
  return parts.filter(Boolean).join(' · ')
}
