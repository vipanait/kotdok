import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from './Text'
import { CONTROL_HEIGHT, TAP_TARGET, colour, radius, space } from './theme'

type Kind = 'primary' | 'secondary' | 'danger' | 'outlineDanger'

const background: Record<Kind, string> = {
  primary: colour.accent,
  secondary: colour.surface,
  danger: colour.danger,
  outlineDanger: 'transparent',
}

const border: Record<Kind, string> = {
  primary: 'transparent',
  secondary: colour.line,
  danger: 'transparent',
  outlineDanger: colour.danger,
}

const label: Record<Kind, 'inverse' | 'default' | 'danger'> = {
  primary: 'inverse',
  secondary: 'default',
  danger: 'inverse',
  outlineDanger: 'danger',
}

/**
 * The one button.
 *
 * `busy` shows a spinner in place of the label rather than beside it, so the
 * button does not change width mid-press, and disables the press — a second tap
 * on a running action is how people end up with two of something.
 */
export function Button({
  title,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
  style,
}: {
  title: string
  onPress: () => void
  kind?: Kind
  busy?: boolean
  disabled?: boolean
  style?: ViewStyle
}) {
  const off = disabled || busy

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      accessibilityLabel={title}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: off ? colour.disabled : background[kind],
          borderColor: off ? 'transparent' : border[kind],
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' || kind === 'danger' ? '#fff' : colour.accent} />
      ) : (
        <Text variant="action" tone={off ? 'faint' : label[kind]}>
          {title}
        </Text>
      )}
    </Pressable>
  )
}

/** A text action. Still 44 points tall, because a link is a tap target too. */
export function LinkButton({
  title,
  onPress,
  align = 'center',
}: {
  title: string
  onPress: () => void
  align?: 'center' | 'left' | 'right'
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="bodyStrong" tone="accent" style={{ textAlign: align }}>
        {title}
      </Text>
    </Pressable>
  )
}

/** Two links on one line, as under the sign-in form. */
export function LinkRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.linkRow}>{children}</View>
}

const styles = StyleSheet.create({
  base: {
    minHeight: CONTROL_HEIGHT,
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { minHeight: TAP_TARGET, justifyContent: 'center', paddingVertical: 10 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.row },
})
