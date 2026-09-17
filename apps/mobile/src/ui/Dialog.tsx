import { Modal, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Button, LinkButton } from './Button'
import { Text } from './Text'
import { colour, radius, space } from './theme'

/**
 * A question that has to be answered before anything else happens.
 *
 * Written rather than handed to `Alert` so it is the app's own voice — the
 * system dialog would arrive in a different typeface, with the destructive
 * choice styled by the platform rather than by what it costs here.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmTitle,
  cancelTitle,
  confirmKind = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean
  title: string
  message: string
  confirmTitle: string
  cancelTitle?: string
  /** Danger by default: most questions here guard something that costs. */
  confirmKind?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useText()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text variant="h2">{title}</Text>
          <Text tone="muted" style={styles.message}>
            {message}
          </Text>
          <Button title={confirmTitle} kind={confirmKind} busy={busy} onPress={onConfirm} />
          <Button
            title={cancelTitle ?? t.common.cancel}
            kind="secondary"
            disabled={busy}
            onPress={onCancel}
            style={styles.second}
          />
        </View>
      </View>
    </Modal>
  )
}

/**
 * "Save the changes?" on the way out of a form.
 *
 * Three answers, because two would force a guess: saving, throwing the changes
 * away, and staying to keep editing are all things people mean.
 */
export function SaveChangesDialog({
  visible,
  busy = false,
  onSave,
  onDiscard,
  onStay,
}: {
  visible: boolean
  busy?: boolean
  onSave: () => void
  onDiscard: () => void
  onStay: () => void
}) {
  const t = useText()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onStay}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text variant="h2">{t.unsaved.title}</Text>
          <Text tone="muted" style={styles.message}>
            {t.unsaved.body}
          </Text>
          <Button title={t.common.save} busy={busy} onPress={onSave} />
          <Button
            title={t.unsaved.discard}
            kind="outlineDanger"
            disabled={busy}
            onPress={onDiscard}
            style={styles.second}
          />
          <LinkButton title={t.unsaved.stay} onPress={onStay} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(31,27,21,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.gutter,
  },
  dialog: {
    width: '100%',
    backgroundColor: colour.surface,
    borderRadius: radius.card,
    padding: 24,
  },
  message: { marginTop: space.row, marginBottom: 24 },
  second: { marginTop: space.row },
})
