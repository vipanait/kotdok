import { Pressable, StyleSheet } from 'react-native'
import { useText } from '@/i18n'
import { Icon, type IconName } from '@/ui/Icon'
import { Sheet } from '@/ui/Sheet'
import { Text } from '@/ui/Text'
import { CONTROL_HEIGHT, colour, space } from '@/ui/theme'

export type AddChoice = { key: string; icon: IconName; label: string; onPress: () => void }

/**
 * «Что добавить?» (M4): one row per kind of record this build can store.
 * A kind whose stage has not landed is not offered at all.
 */
export function AddRecordSheet({
  visible,
  choices,
  onClose,
}: {
  visible: boolean
  choices: readonly AddChoice[]
  onClose: () => void
}) {
  const t = useText()

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text variant="h2" style={styles.title}>
        {t.medicalRecord.addWhat}
      </Text>
      {choices.map((choice, index) => (
        <Pressable
          key={choice.key}
          accessibilityRole="button"
          accessibilityLabel={choice.label}
          onPress={() => {
            onClose()
            choice.onPress()
          }}
          style={({ pressed }) => [styles.row, index > 0 ? styles.divider : null, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name={choice.icon} color={colour.accentText} />
          <Text variant="h3" style={styles.label}>
            {choice.label}
          </Text>
          <Icon name="chevron" size={20} color={colour.faint} />
        </Pressable>
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  title: { marginBottom: space.row },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: CONTROL_HEIGHT + 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line },
  label: { flex: 1 },
})
