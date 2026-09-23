import { useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { PHOTO_LIMITS } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import type { PickedPhoto } from '@/features/checks/photos'
import { Icon } from './Icon'
import { OptionSheet } from './Field'
import { Text } from './Text'
import { TAP_TARGET, colour, space } from './theme'

type Source = 'camera' | 'library'

const TILE = 72

/**
 * Photos under the description (design spec §6.20).
 *
 * The hint about deletion is not a legal footnote: it is the reason someone
 * agrees to photograph their animal's wound at all.
 */
export function PhotoStrip({
  t,
  photos,
  onAdd,
  onRemove,
}: {
  t: Dictionary
  photos: readonly PickedPhoto[]
  onAdd: (source: Source) => void
  onRemove: (index: number) => void
}) {
  const [choosing, setChoosing] = useState(false)

  return (
    <View style={styles.block}>
      <Text variant="label" tone="muted">
        {t.check.photos}
      </Text>

      <View style={styles.row}>
        {photos.map((photo, index) => (
          <View key={photo.uri} style={styles.tile}>
            <Image source={{ uri: photo.uri }} style={styles.preview} accessibilityIgnoresInvertColors />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.check.removePhoto}
              onPress={() => onRemove(index)}
              hitSlop={(TAP_TARGET - 24) / 2}
              style={styles.remove}
            >
              <Icon name="close" size={14} color={colour.surface} />
            </Pressable>
          </View>
        ))}

        {photos.length < PHOTO_LIMITS.maxFiles ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.check.addPhoto}
            onPress={() => setChoosing(true)}
            style={({ pressed }) => [styles.tile, styles.add, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon name="camera" color={colour.muted} />
          </Pressable>
        ) : null}
      </View>

      <Text variant="caption" tone="faint">
        {t.check.photosHint}
      </Text>

      <OptionSheet<Source>
        visible={choosing}
        title={t.check.addPhoto}
        allowNone={false}
        options={[
          { value: 'camera', label: t.check.takePhoto },
          { value: 'library', label: t.check.fromLibrary },
        ]}
        value={null}
        onClose={() => setChoosing(false)}
        onChange={(source) => {
          // The picker is a screen of its own; iOS will not present it while
          // this sheet is still sliding away, so it waits for the sheet.
          if (source) setTimeout(() => onAdd(source), 400)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  block: { gap: space.row / 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.row, paddingTop: space.row / 2 },
  tile: { width: TILE, height: TILE, borderRadius: 12 },
  preview: { width: TILE, height: TILE, borderRadius: 12, backgroundColor: colour.soft },
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colour.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colour.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
