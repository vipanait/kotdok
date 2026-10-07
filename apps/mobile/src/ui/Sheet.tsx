import { useEffect, type ReactNode } from 'react'
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLUMN_MAX_WIDTH, colour, radius, space } from './theme'

/** The room under a sheet's last row where a phone has no system bar of its own to keep clear of. */
const BOTTOM_ROOM = 34

/**
 * The sheet that rises from the bottom: a select's choices, a calendar, «Что
 * добавить?», the weight form, the reminder question. One frame for all of
 * them, so what Android taught one sheet the others need not learn again.
 *
 * - **The keyboard.** The app draws behind the system bars, so a modal window
 *   on Android never shrinks for the keyboard either. Left to `adjustResize`,
 *   the weight sheet sat under the digit pad whole — field and Save — and the
 *   weight was typed blind (Xiaomi Pad 6, 7 October). `padding` lifts it on
 *   both platforms.
 * - **The focus.** A sheet opened while a field below it was being typed into
 *   handed the focus back on closing, and Android raised the keyboard again
 *   for a field nobody had touched. Opening a sheet lets go of the focus.
 * - **The system bar.** The last row clears the gesture handle or the three
 *   buttons, whichever the phone has, and never less than the room the concept
 *   draws.
 * - **A tablet.** The sheet is as wide as the column it rises over, not the
 *   whole glass.
 */
export function Sheet({
  visible,
  onClose,
  onShow,
  children,
}: {
  visible: boolean
  onClose: () => void
  onShow?: () => void
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) Keyboard.dismiss()
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(BOTTOM_ROOM, insets.bottom) }]}
            onPress={() => {}}
            accessible={false}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
          >
            <View style={styles.handle} />
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,21,0.45)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: COLUMN_MAX_WIDTH,
    alignSelf: 'center',
    backgroundColor: colour.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colour.line,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: space.row,
  },
})
