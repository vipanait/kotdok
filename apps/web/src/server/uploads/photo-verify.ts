import { imageSize } from 'image-size'
import { PHOTO_LIMITS } from '@lapka/contracts'
import type { AnalysisPhoto } from '@/server/symptom-check/analyze-symptom-check'

/**
 * What a photo really is, decided from its bytes (stage 6/02).
 *
 * The content type the phone declared, and the one Storage checked against the
 * bucket, are both only what the uploader said. The header is read here, not
 * decoded: that is enough to know the format and the size, and it cannot be
 * made to allocate a huge bitmap.
 */

const MIME_BY_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export type PhotoVerdict =
  | { ok: true; photo: AnalysisPhoto }
  | { ok: false; code: 'unsupported_media_type' | 'payload_too_large'; message: string }

export function verifyPhoto(bytes: Uint8Array): PhotoVerdict {
  if (bytes.byteLength > PHOTO_LIMITS.maxBytes) {
    return { ok: false, code: 'payload_too_large', message: 'Фото больше 5 МБ' }
  }

  let size: ReturnType<typeof imageSize>
  try {
    size = imageSize(bytes)
  } catch {
    return { ok: false, code: 'unsupported_media_type', message: 'Файл не похож на фотографию' }
  }

  const mimeType = size.type ? MIME_BY_TYPE[size.type] : undefined
  if (!mimeType) {
    return { ok: false, code: 'unsupported_media_type', message: 'Поддерживаются JPEG, PNG и WebP' }
  }

  if (size.width > PHOTO_LIMITS.maxSide || size.height > PHOTO_LIMITS.maxSide) {
    return { ok: false, code: 'payload_too_large', message: 'Разрешение фото слишком большое' }
  }

  return { ok: true, photo: { mimeType, data: Buffer.from(bytes).toString('base64') } }
}
