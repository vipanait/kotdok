import * as ImagePicker from 'expo-image-picker'
import { PHOTO_LIMITS } from '@lapka/contracts'
import type { PickedPhoto } from './photos'

/**
 * Photos for a check, from the camera or the library, up to what the check
 * still has room for. Null when nothing was taken: no room, the camera
 * refused, or the picker cancelled.
 */
export async function pickPhotos(source: 'camera' | 'library', already: number): Promise<PickedPhoto[] | null> {
  const left = PHOTO_LIMITS.maxFiles - already
  if (left <= 0) return null
  // Only the camera asks. The library opens the system picker, which hands
  // over just the photos chosen and needs no access to the rest — asking for
  // the whole library would be asking for far more than the check uses.
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    // A refusal is an answer, not an error: the check works without photos.
    if (!permission.granted) return null
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: left,
          quality: 1,
        })
  if (result.canceled) return null
  return result.assets.map(({ uri, width, height }) => ({ uri, width, height }))
}
