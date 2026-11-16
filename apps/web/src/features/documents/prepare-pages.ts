import { DOCUMENT_LIMITS, type DOCUMENT_CONTENT_TYPES } from '@lapka/contracts'
import { drawOnWhite } from '@/features/pets/prepare-photo'

/**
 * The pages of a new document as the browser prepares them (DOC-1): photos
 * of pages made small before they are sent — the long side at most 2000px,
 * a JPEG of quality 0.8 on white, as the phone will send them — and a PDF
 * as it is. A picture of a stored type that is small enough goes unchanged.
 * One document is up to eight pictures or exactly one PDF.
 */

export type PageContentType = (typeof DOCUMENT_CONTENT_TYPES)[number]

export type PreparedPage = { blob: Blob; contentType: PageContentType; name: string }

/** A picked file that cannot be a page, said before anything is sent. */
export type PageFileProblem = 'unreadable' | 'unsupported' | 'pdf_too_large' | 'image_too_large'

export class PageFileError extends Error {
  constructor(
    readonly reason: PageFileProblem,
    readonly fileName: string,
  ) {
    super(`${fileName}: ${reason}`)
    this.name = 'PageFileError'
  }
}

const PDF = 'application/pdf'
const STORED_IMAGES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

export function isPdfFile(file: { type: string; name: string }): boolean {
  return file.type === PDF || (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
}

export function isPdfPage(page: PreparedPage): boolean {
  return page.contentType === PDF
}

/**
 * The picked files as pages, in the order picked. `room`: how many more
 * pictures fit beside the pages already chosen; the ones past it are not
 * read at all. A PDF is not counted against it (it stands alone, `addPages`).
 */
export async function preparePages(files: File[], room: number = DOCUMENT_LIMITS.maxImages): Promise<PreparedPage[]> {
  const pages: PreparedPage[] = []
  let images = 0
  for (const file of files) {
    if (isPdfFile(file)) {
      if (file.size > DOCUMENT_LIMITS.pdfMaxBytes) throw new PageFileError('pdf_too_large', file.name)
      pages.push({ blob: file, contentType: PDF, name: file.name })
      continue
    }
    if (!file.type.startsWith('image/')) throw new PageFileError('unsupported', file.name)
    if (images >= room) continue
    images += 1
    pages.push(await prepareImage(file))
  }
  return pages
}

async function prepareImage(file: File): Promise<PreparedPage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // A format this browser does not decode (HEIC outside Safari) or a broken file.
    throw new PageFileError('unreadable', file.name)
  }
  try {
    const long = Math.max(bitmap.width, bitmap.height)
    if (long <= DOCUMENT_LIMITS.clientLongSide && STORED_IMAGES.includes(file.type) && file.size <= DOCUMENT_LIMITS.imageMaxBytes) {
      return { blob: file, contentType: file.type as PageContentType, name: file.name }
    }
    const scale = Math.min(1, DOCUMENT_LIMITS.clientLongSide / long)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new PageFileError('unreadable', file.name)
    drawOnWhite(context, bitmap, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', DOCUMENT_LIMITS.clientQuality))
    if (!blob) throw new PageFileError('unreadable', file.name)
    if (blob.size > DOCUMENT_LIMITS.imageMaxBytes) throw new PageFileError('image_too_large', file.name)
    return { blob, contentType: 'image/jpeg', name: file.name }
  } finally {
    bitmap.close()
  }
}

/** What did not make it into the document: pictures past eight, or what a PDF cannot stand beside. */
export type PagesDropped = 'limit' | 'pdf_alone' | null

/**
 * New pages beside the chosen ones. A PDF stands alone: it replaces the
 * pictures, and pictures replace it; of several PDFs the first is taken.
 * Pictures are appended up to eight.
 */
export function addPages<T extends PreparedPage>(current: T[], incoming: T[]): { pages: T[]; dropped: PagesDropped } {
  const pdf = incoming.find(isPdfPage)
  if (pdf) {
    return { pages: [pdf], dropped: incoming.length > 1 || current.length > 0 ? 'pdf_alone' : null }
  }
  const replacingPdf = current.some(isPdfPage)
  const combined = [...(replacingPdf ? [] : current), ...incoming]
  if (combined.length > DOCUMENT_LIMITS.maxImages) {
    return { pages: combined.slice(0, DOCUMENT_LIMITS.maxImages), dropped: 'limit' }
  }
  return { pages: combined, dropped: replacingPdf ? 'pdf_alone' : null }
}

/** How many more pictures fit beside the chosen pages (a PDF among them is replaced, so all eight). */
export function pictureRoom(current: PreparedPage[]): number {
  return current.some(isPdfPage) ? DOCUMENT_LIMITS.maxImages : DOCUMENT_LIMITS.maxImages - current.length
}

/** A page one place up (-1) or down (+1); at an end, the list as it was. */
export function movePage<T>(pages: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= pages.length) return pages
  const next = [...pages]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
