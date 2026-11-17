import { Worker } from 'node:worker_threads'
import { DOCUMENT_CONTENT_TYPES, DOCUMENT_LIMITS } from '@lapka/contracts'
import { verifyPhoto } from '@/server/uploads/photo-verify'

/**
 * What a stored document file really is, decided from its bytes (DOC-1).
 *
 * The declared type is only what the uploader said. A PDF is told apart by its
 * `%PDF-` signature, everything else goes through the photo check; a file
 * whose bytes disagree with the declared kind (PDF vs. image) is refused.
 */

// contracts exports the list but not the union type.
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number]

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

/**
 * pdf-lib inflates whatever the file tells it to, with no cap, so a small
 * hostile PDF can hang the function or eat its memory (an out-of-memory kill
 * cannot be caught). The parse therefore runs in a worker with a heap limit
 * and a deadline; any failure there counts as "not a usable PDF".
 *
 * The worker is an inline script rather than a file so that no bundler has to
 * find it; it loads pdf-lib from node_modules at run time, which is why
 * next.config keeps pdf-lib external and traced.
 */
const PARSE_TIMEOUT_MS = 5_000
const MAX_STREAM_BYTES = 64 * 1024 * 1024
const PARSE_HEAP_MB = 256

const PARSE_SCRIPT = `
const path = require('node:path')
const { parentPort, workerData } = require('node:worker_threads')
const entry = require.resolve('pdf-lib', { paths: [workerData.cwd] })
const { PDFDocument } = require(entry)
// The heap limit does not cover typed arrays, which is where a decoded stream
// lives. Every decoder grows its buffer through ensureBuffer, so a stream that
// would pass the cap is cut off there.
const DecodeStream = require(path.join(path.dirname(entry), 'core/streams/DecodeStream')).default
const ensureBuffer = DecodeStream.prototype.ensureBuffer
DecodeStream.prototype.ensureBuffer = function (requested) {
  if (requested > workerData.maxStreamBytes) throw new Error('decoded stream too large')
  return ensureBuffer.call(this, requested)
}
PDFDocument.load(workerData.bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })
  .then((doc) => parentPort.postMessage({ pageCount: doc.getPageCount(), encrypted: doc.isEncrypted }))
  .catch(() => parentPort.postMessage(null))
`

type ParseResult = { pageCount: number; encrypted: boolean } | null

function parsePdf(bytes: Uint8Array): Promise<ParseResult> {
  return new Promise((resolve) => {
    const worker = new Worker(PARSE_SCRIPT, {
      eval: true,
      workerData: { bytes, cwd: process.cwd(), maxStreamBytes: MAX_STREAM_BYTES },
      resourceLimits: { maxOldGenerationSizeMb: PARSE_HEAP_MB, maxYoungGenerationSizeMb: 32 },
    })
    const done = (result: ParseResult) => {
      clearTimeout(timer)
      void worker.terminate()
      resolve(result)
    }
    const timer = setTimeout(() => done(null), PARSE_TIMEOUT_MS)
    worker.once('message', done)
    worker.once('error', () => done(null))
    worker.once('exit', () => done(null))
  })
}

/**
 * An encrypted PDF 1.5+ keeps its objects in compressed streams that pdf-lib
 * cannot inflate, so the parse fails; but the `/Encrypt` entry itself sits in
 * the plain-text trailer or xref-stream dictionary and can be found by hand.
 */
function declaresEncryption(bytes: Uint8Array): boolean {
  return /\/Encrypt\s+\d+\s+\d+\s+R/.test(Buffer.from(bytes).toString('latin1'))
}

async function verifyPdf(bytes: Uint8Array): Promise<DocumentFileVerdict> {
  if (bytes.byteLength > DOCUMENT_LIMITS.pdfMaxBytes) return { ok: false, reason: 'payload_too_large' }

  const parsed = await parsePdf(bytes)
  if (!parsed) return { ok: false, reason: declaresEncryption(bytes) ? 'encrypted' : 'unsupported_media_type' }
  if (parsed.encrypted) return { ok: false, reason: 'encrypted' }
  if (parsed.pageCount < 1) return { ok: false, reason: 'unsupported_media_type' }
  if (parsed.pageCount > DOCUMENT_LIMITS.pdfMaxPages) return { ok: false, reason: 'too_many_pages' }
  return { ok: true, contentType: 'application/pdf', pageCount: parsed.pageCount }
}
