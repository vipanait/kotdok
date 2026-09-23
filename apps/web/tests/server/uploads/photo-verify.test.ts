import { describe, expect, it } from 'vitest'
import { PHOTO_LIMITS } from '@lapka/contracts'
import { verifyPhoto } from '@/server/uploads/photo-verify'

/** Enough of a PNG for its header to be read: signature and IHDR. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  bytes.set([8, 6, 0, 0, 0], 24)
  return bytes
}

/**
 * Enough of a JPEG: SOI, an empty APP0, then a baseline SOF0 carrying the size.
 * The APP0 is not decoration — image-size skips the first segment unread, so a
 * SOF0 placed first would never be found.
 */
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

const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00')

describe('verifyPhoto', () => {
  it('passes a JPEG on with its real type and base64 bytes', () => {
    const bytes = jpeg(1600, 1200)
    expect(verifyPhoto(bytes)).toEqual({
      ok: true,
      photo: { mimeType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') },
    })
  })

  it('names the type from the bytes, not from what was declared', () => {
    expect(verifyPhoto(png(800, 600))).toMatchObject({ ok: true, photo: { mimeType: 'image/png' } })
  })

  it('refuses something that is not an image at all', () => {
    expect(verifyPhoto(new TextEncoder().encode('hello, not a photo'))).toMatchObject({
      ok: false,
      code: 'unsupported_media_type',
    })
  })

  it('refuses an image in a format the AI provider is not given', () => {
    expect(verifyPhoto(GIF)).toMatchObject({ ok: false, code: 'unsupported_media_type' })
  })

  it('refuses an image wider or taller than the limit', () => {
    expect(verifyPhoto(png(PHOTO_LIMITS.maxSide, PHOTO_LIMITS.maxSide))).toMatchObject({ ok: true })
    expect(verifyPhoto(png(PHOTO_LIMITS.maxSide + 1, 10))).toMatchObject({ ok: false, code: 'payload_too_large' })
    expect(verifyPhoto(jpeg(10, PHOTO_LIMITS.maxSide + 1))).toMatchObject({ ok: false, code: 'payload_too_large' })
  })

  it('refuses a file over the byte limit without reading it', () => {
    const big = new Uint8Array(PHOTO_LIMITS.maxBytes + 1)
    big.set(jpeg(100, 100))
    expect(verifyPhoto(big)).toMatchObject({ ok: false, code: 'payload_too_large' })
  })
})
