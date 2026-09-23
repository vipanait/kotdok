import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File } from 'expo-file-system'
import { fetch } from 'expo/fetch'
import {
  PHOTO_QUALITY,
  resizeTarget,
  type PickedPhoto,
  type PreparedPhoto,
} from '@/features/checks/photos'

/**
 * The native half of sending photos. Always re-encodes to JPEG: that is what
 * turns an iPhone's HEIC into something the server and the AI can read, and
 * what drops EXIF — including where the photo was taken.
 */
export async function preparePhoto(photo: PickedPhoto): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(photo.uri)
  const target = resizeTarget(photo)
  if (target) context.resize(target)
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY })
  return { uri: saved.uri, size: new File(saved.uri).size, contentType: 'image/jpeg' }
}

/** @returns whether storage accepted the file; a dropped connection is a no. */
export async function putPhoto(
  url: string,
  headers: Record<string, string>,
  file: PreparedPhoto,
): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'PUT', headers, body: new File(file.uri) })
    return response.ok
  } catch {
    return false
  }
}
