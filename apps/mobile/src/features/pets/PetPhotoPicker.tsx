import { useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import type { Pet } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { prepareAvatar, putPhoto } from '@/lib/photo-io'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Avatar, Banner } from '@/ui/Card'
import { colour, space } from '@/ui/theme'
import { uploadAvatar } from './pet-avatar'

/**
 * The pet's photo in its form (FB-4): the photo or the drawing, «Сменить
 * фото» from the library or the camera, «Убрать фото». Saved at once, apart
 * from the form's «Сохранить» — a photo is not a field to forget to save.
 */
export function PetPhotoPicker({ pet, onChanged }: { pet: Pet; onChanged: (pet: Pet) => void }) {
  const t = useText()
  const words = t.petPhoto
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [denied, setDenied] = useState(false)

  async function pick(source: 'library' | 'camera') {
    setError(null)
    setDenied(false)
    let picked: ImagePicker.ImagePickerResult
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        // Said, with the way to Settings: a tap that does nothing reads as broken.
        if (!permission.granted) {
          setDenied(true)
          return
        }
      }
      picked =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [1, 1] })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [1, 1] })
    } catch {
      // No camera (a simulator), or the picker failed to open.
      setError(words.pickFailed)
      return
    }
    if (picked.canceled || !picked.assets[0]) return
    const { uri, width, height } = picked.assets[0]

    setBusy(true)
    try {
      const updated = await withFreshSession((api) =>
        uploadAvatar(
          {
            prepare: prepareAvatar,
            requestAvatar: (id, body) => api.requestAvatar(id, body),
            put: putPhoto,
            confirmAvatar: (id, path) => api.confirmAvatar(id, path),
          },
          pet.id,
          { uri, width, height },
        ),
      )
      onChanged(updated)
    } catch (cause) {
      setError(describeFailure(t, cause, words.failed).text)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      onChanged(await withFreshSession((api) => api.removeAvatar(pet.id)))
    } catch (cause) {
      setError(describeFailure(t, cause, words.failed).text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Avatar species={pet.species} uri={pet.avatar_url} size={72} />
        {busy ? <ActivityIndicator color={colour.accent} accessibilityLabel={words.saving} /> : null}
        <View style={styles.actions}>
          <LinkButton title={pet.avatar_url ? words.change : words.add} align="left" onPress={() => void pick('library')} disabled={busy} />
          <LinkButton title={words.camera} align="left" onPress={() => void pick('camera')} disabled={busy} />
          {pet.avatar_url ? <LinkButton title={words.remove} align="left" onPress={() => void remove()} disabled={busy} /> : null}
        </View>
      </View>
      {error ? <Banner text={error} tone="error" /> : null}
      {denied ? (
        <>
          <Banner text={words.cameraDenied} tone="error" />
          <LinkButton title={words.openSettings} align="left" onPress={() => void Linking.openSettings()} />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { marginBottom: space.block },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actions: { flex: 1 },
})
