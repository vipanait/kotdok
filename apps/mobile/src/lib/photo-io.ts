import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File } from 'expo-file-system'
import { fetch } from 'expo/fetch'
import { AVATAR_QUALITY, avatarTarget } from '@/features/pets/pet-avatar'
import {
  PHOTO_QUALITY,
  resizeTarget,
  type PickedPhoto,
  type PreparedPhoto,
} from '@/features/checks/photos'
import { DOCUMENT_LIMITS } from '@lapka/contracts'
import { documentPageTarget } from '@/features/documents/page-list'

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

/** The pet's photo (FB-4): smaller than a check's, re-encoded the same way. */
export async function prepareAvatar(photo: PickedPhoto): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(photo.uri)
  const target = avatarTarget(photo)
  if (target) context.resize(target)
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: AVATAR_QUALITY })
  return { uri: saved.uri, size: new File(saved.uri).size, contentType: 'image/jpeg' }
}

/**
 * A photo of a document's page (DOC-1): the long side at most
 * `DOCUMENT_LIMITS.clientLongSide`, JPEG at `clientQuality` — the numbers the
 * site uses too — re-encoded the same way, so a HEIC page becomes a JPEG.
 */
export async function prepareDocumentPhoto(photo: PickedPhoto): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(photo.uri)
  const target = documentPageTarget(photo)
  if (target) context.resize(target)
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: DOCUMENT_LIMITS.clientQuality })
  return { uri: saved.uri, size: new File(saved.uri).size, contentType: 'image/jpeg' }
}

/** @returns whether storage accepted the file; a dropped connection is a no. */
export async function putFile(url: string, headers: Record<string, string>, uri: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'PUT', headers, body: new File(uri) })
    return response.ok
  } catch {
    return false
  }
}

/** @returns whether storage accepted the file; a dropped connection is a no. */
export async function putPhoto(
  url: string,
  headers: Record<string, string>,
  file: PreparedPhoto,
): Promise<boolean> {
  return putFile(url, headers, file.uri)
}
