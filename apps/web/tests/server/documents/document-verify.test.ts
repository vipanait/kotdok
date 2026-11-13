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
})
