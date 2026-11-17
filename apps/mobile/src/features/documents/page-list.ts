import { DOCUMENT_LIMITS, type DOCUMENT_CONTENT_TYPES } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import type { PickedPhoto } from '@/features/checks/photos'

/**
 * The pages of a new document on the phone (DOC-1), before anything is sent:
 * photos already made small (`documentPageTarget`) or one PDF as it is. One
 * document is up to eight photos or exactly one PDF, never both — the same
 * rules as the site's `prepare-pages.ts`. Nothing here touches the file
 * system: the native half is `document-io.ts`.
 */

export type PageContentType = (typeof DOCUMENT_CONTENT_TYPES)[number]

/** How a page got here: it names a page that has no file name of its own («Фото с камеры 2»). */
export type PageSource = 'camera' | 'library' | 'pdf'

/** A page as picked and prepared, before it is numbered into the draft. */
export type PickedPage = {
  uri: string
  contentType: PageContentType
  size: number
  /** The file's own name when the phone gave one; a camera photo has none worth showing. */
  name: string | null
  source: PageSource
}

/**
 * A page of the draft. `key` is stable across moves (the list's key and the
 * thing focus follows); `ordinal` is the n-th photo from its source in this
 * draft, fixed when it was picked, so «Фото с камеры 2» keeps its name when
 * it is moved to the top.
 */
export type DraftPage = PickedPage & { key: string; ordinal: number }

/** Counters for keys and captions, kept by the screen for the life of the draft. */
export type PageCounters = { next: number; camera: number; library: number; pdf: number }

export const NO_PAGES: PageCounters = { next: 1, camera: 0, library: 0, pdf: 0 }

/** Picked pages with their keys and captions' numbers, and the counters after them. */
export function numberPages(picked: readonly PickedPage[], counters: PageCounters): { pages: DraftPage[]; counters: PageCounters } {
  let next = { ...counters }
  const pages = picked.map((page) => {
    const ordinal = next[page.source] + 1
    const numbered: DraftPage = { ...page, key: `page-${next.next}`, ordinal }
    next = { ...next, next: next.next + 1, [page.source]: ordinal }
    return numbered
  })
  return { pages, counters: next }
}

/** What a page is called in the list: its file name, or «Фото с камеры 2». */
export function pageCaption(t: Dictionary, page: Pick<DraftPage, 'name' | 'source' | 'ordinal'>): string {
  if (page.source === 'camera') return t.documents.upload.cameraPhoto(page.ordinal)
  const name = page.name?.trim()
  if (name) return name
  return page.source === 'library' ? t.documents.upload.libraryPhoto(page.ordinal) : t.documents.upload.pdf
}

export function isPdfPage(page: Pick<PickedPage, 'contentType'>): boolean {
  return page.contentType === 'application/pdf'
}

/** What did not make it into the document: photos past eight, or what a PDF cannot stand beside. */
export type PagesDropped = 'limit' | 'pdf_alone' | null

/**
 * New pages beside the chosen ones. A PDF stands alone: it replaces the
 * photos, and photos replace it; of several PDFs the first is taken. Photos
 * are appended up to eight.
 */
export function addPages<T extends Pick<PickedPage, 'contentType'>>(current: readonly T[], incoming: readonly T[]): { pages: T[]; dropped: PagesDropped } {
  const pdf = incoming.find(isPdfPage)
  if (pdf) {
    return { pages: [pdf], dropped: incoming.length > 1 || current.length > 0 ? 'pdf_alone' : null }
  }
  const replacingPdf = current.some(isPdfPage)
  const combined = [...(replacingPdf ? [] : current), ...incoming]
  if (combined.length > DOCUMENT_LIMITS.maxImages) {
    return { pages: combined.slice(0, DOCUMENT_LIMITS.maxImages), dropped: 'limit' }
  }
  return { pages: combined, dropped: replacingPdf && incoming.length > 0 ? 'pdf_alone' : null }
}

/** How many more photos fit beside the chosen pages (a PDF among them is replaced, so all eight). */
export function photoRoom(current: readonly Pick<PickedPage, 'contentType'>[]): number {
  return current.some(isPdfPage) ? DOCUMENT_LIMITS.maxImages : DOCUMENT_LIMITS.maxImages - current.length
}

/** A page one place up (-1) or down (+1); at an end, the list as it was. Numbers follow the places. */
export function movePage<T>(pages: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= pages.length) return [...pages]
  const next = [...pages]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** The pages without the one at `index`; the rest keep their order and are numbered again by place. */
export function removePage<T>(pages: readonly T[], index: number): T[] {
  if (index < 0 || index >= pages.length) return [...pages]
  return pages.filter((_, i) => i !== index)
}

/** Whether leaving would lose something: a page, or a typed name. A kind alone is one tap to choose again. */
export function draftChanged(pages: readonly unknown[], title: string): boolean {
  return pages.length > 0 || title.trim() !== ''
}

/**
 * A photo of a page made small before it is sent: the long side at most
 * `DOCUMENT_LIMITS.clientLongSide`, as the site does. Null when it already fits.
 */
export function documentPageTarget(photo: PickedPhoto): { width: number } | { height: number } | null {
  const side = DOCUMENT_LIMITS.clientLongSide
  if (Math.max(photo.width, photo.height) <= side) return null
  return photo.width >= photo.height ? { width: side } : { height: side }
}

/** A picked file that cannot be a page, said before anything is sent. */
export type PageFileProblem = 'unreadable' | 'unsupported' | 'pdf_too_large' | 'image_too_large'

export type PageProblem = { reason: PageFileProblem; name: string }

/** A file from the document picker: a PDF within its size, or the reason it is not one. */
export function checkPdf(file: { name: string; size: number | null; mimeType: string | null }): PageFileProblem | null {
  const pdf = file.mimeType === 'application/pdf' || (!file.mimeType && file.name.toLowerCase().endsWith('.pdf'))
  if (!pdf) return 'unsupported'
  if (file.size !== null && file.size > DOCUMENT_LIMITS.pdfMaxBytes) return 'pdf_too_large'
  return null
}

/** A prepared photo still over the limit after it was made small. */
export function photoTooLarge(size: number): boolean {
  return size > DOCUMENT_LIMITS.imageMaxBytes
}

/** One way to add pages: the camera, the library, the document picker. */
export type PickMethod = 'camera' | 'library' | 'pdf'

/**
 * The ways this build offers. PDF only when the document picker is in the
 * installed app (`expo-document-picker` is a native module: a build without
 * it shows two buttons, not a third that fails).
 */
export function pickMethods(pdfAvailable: boolean): PickMethod[] {
  return pdfAvailable ? ['camera', 'library', 'pdf'] : ['camera', 'library']
}

/** Under the chosen pages: photos while there is room for one more, a PDF when the picker is there. */
export function addMoreMethods(pages: readonly Pick<PickedPage, 'contentType'>[], pdfAvailable: boolean): PickMethod[] {
  return pickMethods(pdfAvailable).filter((method) => method === 'pdf' || photoRoom(pages) > 0)
}
