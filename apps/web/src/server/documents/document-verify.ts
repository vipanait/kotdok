import { PDFDocument } from 'pdf-lib'
import { DOCUMENT_LIMITS, type DocumentContentType } from '@lapka/contracts'
import { verifyPhoto } from '@/server/uploads/photo-verify'

/**
 * What a stored document file really is, decided from its bytes (DOC-1).
 *
 * The declared type is only what the uploader said. A PDF is told apart by its
 * `%PDF-` signature, everything else goes through the photo check; a file
 * whose bytes disagree with the declared kind (PDF vs. image) is refused.
 */

export type DocumentFileVerdict =
  | { ok: true; contentType: DocumentContentType; pageCount: number }
  | { ok: false; reason: 'unsupported_media_type' | 'payload_too_large' | 'too_many_pages' | 'encrypted' }

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

function isPdf(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, i) => bytes[i] === byte)
}

export async function verifyDocumentFile(bytes: Uint8Array, declared: DocumentContentType): Promise<DocumentFileVerdict> {
  const declaredPdf = declared === 'application/pdf'
  if (isPdf(bytes) !== declaredPdf) return { ok: false, reason: 'unsupported_media_type' }

  return declaredPdf ? verifyPdf(bytes) : verifyImage(bytes)
}

function verifyImage(bytes: Uint8Array): DocumentFileVerdict {
  if (bytes.byteLength > DOCUMENT_LIMITS.imageMaxBytes) return { ok: false, reason: 'payload_too_large' }

  const verdict = verifyPhoto(bytes)
  if (!verdict.ok) return { ok: false, reason: verdict.code }

  return { ok: true, contentType: verdict.photo.mimeType as DocumentContentType, pageCount: 1 }
}

async function verifyPdf(bytes: Uint8Array): Promise<DocumentFileVerdict> {
  if (bytes.byteLength > DOCUMENT_LIMITS.pdfMaxBytes) return { ok: false, reason: 'payload_too_large' }

  let doc: PDFDocument
  let pageCount: number
  try {
    // pdf-lib's own EncryptedPDFError is compiled to ES5 and fails `instanceof`,
    // so the file is loaded regardless and `isEncrypted` is read instead.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    pageCount = doc.getPageCount()
  } catch {
    return { ok: false, reason: 'unsupported_media_type' }
  }
  if (doc.isEncrypted) return { ok: false, reason: 'encrypted' }
  if (pageCount < 1) return { ok: false, reason: 'unsupported_media_type' }
  if (pageCount > DOCUMENT_LIMITS.pdfMaxPages) return { ok: false, reason: 'too_many_pages' }
  return { ok: true, contentType: 'application/pdf', pageCount }
}
