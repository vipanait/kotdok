import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from './Text'
import { colour, radius, shadow, space, urgency as urgencyScale } from './theme'

const art = {
  cat: require('../../assets/art/avatar-cat.png'),
  dog: require('../../assets/art/avatar-dog.png'),
} as const

/** A white card. Pressable when it leads somewhere, plain when it does not. */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: React.ReactNode
  onPress?: () => void
  accessibilityLabel?: string
  style?: ViewStyle
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }, style]}
    >
      {children}
    </Pressable>
  )
}

/**
 * A species portrait, not a photograph of anyone's pet.
 *
 * Deliberately drawn rather than photographic: the app has no pictures of the
 * animal it is talking about, and a photo-like avatar would imply it did.
 */
export function Avatar({ species }: { species: 'cat' | 'dog' }) {
  return (
    <Image
      source={art[species]}
      style={styles.avatar}
      resizeMode="contain"
      accessible={false}
    />
  )
}

/** An aside: a hint in accent, a problem in red. */
export function Banner({
  text,
  tone = 'info',
  style,
}: {
  text: string
  tone?: 'info' | 'error'
  style?: ViewStyle
}) {
  const isError = tone === 'error'

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        { backgroundColor: isError ? colour.dangerSoft : colour.accentSoft },
        style,
      ]}
    >
      <Text tone={isError ? 'danger' : 'default'}>{text}</Text>
    </View>
  )
}

export type UrgencyLevel = keyof typeof urgencyScale

/** The answer, and the loudest thing on the result screen. */
export function UrgencyCard({
  level,
  label,
  action,
  reason,
}: {
  level: UrgencyLevel
  label: string
  action: string
  reason: string
}) {
  const tone = urgencyScale[level]

  return (
    <View style={[styles.urgency, { backgroundColor: tone.background }]}>
      <Text variant="urgencyTitle" style={{ color: tone.signal, letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text variant="h3" style={styles.urgencyAction}>
        {action}
      </Text>
      <Text tone="muted" style={styles.urgencyReason}>
        {reason}
      </Text>
    </View>
  )
}

/** The same scale, small enough to sit on a list row. */
export function UrgencyBadge({ level, label }: { level: UrgencyLevel; label: string }) {
  const tone = urgencyScale[level]

  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
      <Text variant="caption" style={{ color: tone.signal, fontWeight: '700' }}>
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colour.surface,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: space.row,
    ...shadow.card,
  },
  avatar: { width: 48, height: 48 },
  banner: {
    padding: 14,
    borderRadius: radius.field,
    marginBottom: space.block,
  },
  urgency: {
    padding: space.block,
    borderRadius: radius.card,
    marginBottom: space.block,
    ...shadow.card,
  },
  urgencyAction: { marginTop: space.row },
  urgencyReason: { marginTop: space.row },
  badge: {
    alignSelf: 'flex-start',
    minHeight: 24,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
})
