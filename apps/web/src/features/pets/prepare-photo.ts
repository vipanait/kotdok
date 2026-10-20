import { AVATAR_LONG_SIDE, type PreparedPhoto } from './pet-photo'

/**
 * A picked picture made small in the browser before it is sent: its long
 * side at most 1024px, as a JPEG — a camera photo of several megabytes
 * becomes a couple of hundred kilobytes and stays under the API's 5 MB.
 * A picture already small enough is sent as it is.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file)
  try {
    const long = Math.max(bitmap.width, bitmap.height)
    if (long <= AVATAR_LONG_SIDE && file.size <= 1024 * 1024) {
      return { blob: file, contentType: file.type as PreparedPhoto['contentType'] }
    }
    const scale = Math.min(1, AVATAR_LONG_SIDE / long)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('no image')
    return { blob, contentType: 'image/jpeg' }
  } finally {
    bitmap.close()
  }
}
