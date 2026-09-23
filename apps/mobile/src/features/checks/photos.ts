import { PHOTO_LIMITS } from '@lapka/contracts'

/**
 * Photos attached to a check, before they are sent.
 *
 * Nothing here touches the file system: the native half lives in
 * `lib/photo-io.ts`, so this stays testable in plain Node.
 */

export type PickedPhoto = { uri: string; width: number; height: number }
export type PreparedPhoto = { uri: string; size: number; contentType: 'image/jpeg' }

/**
 * A phone photo is 12 MP or more. The AI provider scales everything down to
 * 2048 anyway; 1600 keeps what matters for a wound or an eye at roughly half a
 * megabyte, so three of them upload quickly on a weak connection.
 */
export const PHOTO_LONG_SIDE = 1600
export const PHOTO_QUALITY = 0.7

export function resizeTarget(photo: PickedPhoto): { width: number } | { height: number } | null {
  if (Math.max(photo.width, photo.height) <= PHOTO_LONG_SIDE) return null
  return photo.width >= photo.height ? { width: PHOTO_LONG_SIDE } : { height: PHOTO_LONG_SIDE }
}

export function addPhotos(current: PickedPhoto[], incoming: PickedPhoto[]): PickedPhoto[] {
  return [...current, ...incoming].slice(0, PHOTO_LIMITS.maxFiles)
}
