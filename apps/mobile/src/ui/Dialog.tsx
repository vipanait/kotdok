import { Modal, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Button } from './Button'
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
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean
  title: string
  message: string
  confirmTitle: string
  cancelTitle?: string
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
          <Button title={confirmTitle} kind="danger" busy={busy} onPress={onConfirm} />
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
