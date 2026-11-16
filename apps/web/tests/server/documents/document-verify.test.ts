import { deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { DOCUMENT_LIMITS } from '@lapka/contracts'
import { verifyDocumentFile } from '@/server/documents/document-verify'

/** Enough of a JPEG: SOI, an empty APP0, then a baseline SOF0 carrying the size. */
function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x02,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ])
}

async function pdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage()
  return doc.save()
}

/** A one-page PDF whose trailer points at an /Encrypt dictionary. */
function encryptedPdf(): Uint8Array {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n',
    '4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (0123456789abcdef0123456789abcdef) /U (0123456789abcdef0123456789abcdef) /P -4 >>\nendobj\n',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const o of objects) {
    offsets.push(body.length)
    body += o
  }
  const xref = body.length
  body += `xref\n0 5\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

/**
 * A PDF 1.5 file: a compressed object stream and an xref-stream trailer, the
 * way real writers produce them. `objStream` is the stream body as stored;
 * `encrypted` adds an /Encrypt entry to the xref stream dictionary.
 */
function pdf15(objStream: Uint8Array, encrypted: boolean): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const size = () => parts.reduce((n, p) => n + p.length, 0)
  const text = (t: string) => parts.push(enc.encode(t))
  text('%PDF-1.5\n')
  const o1 = size()
  text(`1 0 obj\n<< /Type /ObjStm /N 2 /First 10 /Filter /FlateDecode /Length ${objStream.length} >>\nstream\n`)
  parts.push(objStream)
  text('\nendstream\nendobj\n')
  const o2 = size()
  text('2 0 obj\n<< /Filter /Standard /V 1 /R 2 /P -4 >>\nendobj\n')
  const xref = size()
  const rows = [[0, 0, 255], [1, o1, 0], [1, o2, 0], [1, xref, 0]]
  const entries = new Uint8Array(rows.flatMap(([t, a, b]) => [t, a >> 8, a & 0xff, b]))
  text(`3 0 obj\n<< /Type /XRef /Size 4 /W [1 2 1] /Root 4 0 R${encrypted ? ' /Encrypt 2 0 R' : ''} /Length ${entries.length} >>\nstream\n`)
  parts.push(entries)
  text(`\nendstream\nendobj\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(size())
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('verifyDocumentFile', () => {
  it('accepts a jpeg within limits', async () => {
    expect(await verifyDocumentFile(jpeg(1600, 1200), 'image/jpeg')).toEqual({
      ok: true,
      contentType: 'image/jpeg',
      pageCount: 1,
    })
  })

  it('accepts a 3 page pdf', async () => {
    expect(await verifyDocumentFile(await pdf(3), 'application/pdf')).toEqual({
      ok: true,
      contentType: 'application/pdf',
      pageCount: 3,
    })
  })

  it('refuses an encrypted pdf', async () => {
    expect(await verifyDocumentFile(encryptedPdf(), 'application/pdf')).toEqual({ ok: false, reason: 'encrypted' })
  })

  it('refuses an 11 page pdf', async () => {
    expect(await verifyDocumentFile(await pdf(DOCUMENT_LIMITS.pdfMaxPages + 1), 'application/pdf')).toEqual({
      ok: false,
      reason: 'too_many_pages',
    })
  })

  it('refuses pdf bytes declared as jpeg', async () => {
    expect(await verifyDocumentFile(await pdf(1), 'image/jpeg')).toEqual({ ok: false, reason: 'unsupported_media_type' })
  })

  it('refuses image bytes declared as pdf', async () => {
    expect(await verifyDocumentFile(jpeg(100, 100), 'application/pdf')).toEqual({
      ok: false,
      reason: 'unsupported_media_type',
    })
  })

  it('refuses a jpeg wider than 4096', async () => {
    expect(await verifyDocumentFile(jpeg(DOCUMENT_LIMITS.imageMaxSide + 1, 100), 'image/jpeg')).toEqual({
      ok: false,
      reason: 'payload_too_large',
    })
  })

  it('refuses a pdf over 10 MB', async () => {
    const big = new Uint8Array(DOCUMENT_LIMITS.pdfMaxBytes + 1)
    big.set(new TextEncoder().encode('%PDF-1.7\n'))
    expect(await verifyDocumentFile(big, 'application/pdf')).toEqual({ ok: false, reason: 'payload_too_large' })
  })

  it('refuses a broken pdf', async () => {
    const junk = new TextEncoder().encode('%PDF-1.7\nthis is not a pdf')
    expect(await verifyDocumentFile(junk, 'application/pdf')).toEqual({ ok: false, reason: 'unsupported_media_type' })
  })

  it('refuses a PDF 1.5 encrypted file whose object stream pdf-lib cannot inflate', async () => {
    const bytes = pdf15(new Uint8Array([1, 2, 3, 4]), true)
    expect(await verifyDocumentFile(bytes, 'application/pdf')).toEqual({ ok: false, reason: 'encrypted' })
  })

  it('refuses a flate bomb in an object stream long before the deadline', async () => {
    const bomb = deflateSync(Buffer.alloc(768 * 1024 * 1024), { level: 9 })
    expect(bomb.length).toBeLessThan(DOCUMENT_LIMITS.pdfMaxBytes)
    const started = Date.now()
    expect(await verifyDocumentFile(pdf15(bomb, false), 'application/pdf')).toEqual({
      ok: false,
      reason: 'unsupported_media_type',
    })
    expect(Date.now() - started).toBeLessThan(3_000)
  }, 30_000)

  it('accepts a 10 page pdf and a 4096 px jpeg', async () => {
    expect(await verifyDocumentFile(await pdf(DOCUMENT_LIMITS.pdfMaxPages), 'application/pdf')).toMatchObject({ ok: true, pageCount: 10 })
    expect(await verifyDocumentFile(jpeg(DOCUMENT_LIMITS.imageMaxSide, 100), 'image/jpeg')).toMatchObject({ ok: true })
  })
})
