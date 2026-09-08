import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { colour, radius, shadow, space, urgency as urgencyScale } from './theme'

const art = {
  cat: require('../../assets/art/avatar-cat.png'),
  dog: require('../../assets/art/avatar-dog.png'),
} as const

/**
 * A card. White with a soft shadow by default; `outlined` is the flatter one
 * the history uses, where a column of shadows would read as a pile.
 */
export function Card({
  children,
  onPress,
  outlined = false,
  accessibilityLabel,
  style,
}: {
  children: React.ReactNode
  onPress?: () => void
  outlined?: boolean
  accessibilityLabel?: string
  style?: ViewStyle
}) {
  const skin = [styles.card, outlined ? styles.outlined : shadow.card, style]

  if (!onPress) return <View style={skin}>{children}</View>

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [...skin, { opacity: pressed ? 0.9 : 1 }]}
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
    <Image source={art[species]} style={styles.avatar} resizeMode="contain" accessible={false} />
  )
}

/** A round tinted disc with a glyph in it, where there is no portrait to show. */
export function IconAvatar({ icon, size = 48 }: { icon: IconName; size?: number }) {
  return (
    <View style={[styles.iconAvatar, { width: size, height: size }]}>
      <Icon name={icon} size={Math.round(size / 2)} color={colour.accentText} />
    </View>
  )
}

/** An aside: a hint in accent, a problem in red. */
export function Banner({
  text,
  tone = 'info',
  icon,
  style,
}: {
  text: string
  tone?: 'info' | 'error'
  icon?: IconName
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
      <Icon
        name={icon ?? (isError ? 'alert' : 'info')}
        size={20}
        color={isError ? colour.danger : colour.accentText}
      />
      <Text tone={isError ? 'danger' : 'default'} style={styles.bannerText}>
        {text}
      </Text>
    </View>
  )
}

export type UrgencyLevel = keyof typeof urgencyScale

/** The answer, and the loudest thing on the result screen. */
export function UrgencyCard({
  level,
  icon,
  label,
  action,
  reason,
}: {
  level: UrgencyLevel
  icon: IconName
  label: string
  action: string
  reason: string
}) {
  const tone = urgencyScale[level]

  return (
    <View style={[styles.urgency, { backgroundColor: tone.background }]}>
      <View style={styles.urgencyHead}>
        <Icon name={icon} color={tone.signal} />
        <Text variant="urgencyTitle" style={[styles.urgencyLabel, { color: tone.signal }]}>
          {label}
        </Text>
      </View>
      <Text variant="h3" style={styles.urgencyAction}>
        {action}
      </Text>
      {reason ? (
        <Text tone="muted" style={styles.urgencyReason}>
          {reason}
        </Text>
      ) : null}
    </View>
  )
}

/** The same scale, small enough to sit on a list row. */
export function UrgencyBadge({ level, label }: { level: UrgencyLevel; label: string }) {
  const tone = urgencyScale[level]

  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
      <Text variant="caption" style={{ color: tone.signal, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  )
}

/** A row in a list of settings: glyph, name, current value, chevron. */
export function SettingRow({
  icon,
  title,
  value,
  onPress,
}: {
  icon?: IconName
  title: string
  value?: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}: ${value}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.setting, { opacity: pressed ? 0.6 : 1 }]}
    >
      {icon ? <Icon name={icon} size={20} color={colour.text} /> : null}
      <Text style={styles.settingTitle}>{title}</Text>
      {value ? (
        <Text variant="label" tone="faint">
          {value}
        </Text>
      ) : null}
      <Icon name="chevron" size={20} color={colour.faint} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colour.surface,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: space.row,
  },
  outlined: { borderWidth: 1, borderColor: colour.line },
  avatar: { width: 48, height: 48 },
  iconAvatar: {
    borderRadius: radius.pill,
    backgroundColor: colour.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.field,
    marginBottom: space.block,
  },
  bannerText: { flex: 1 },
  urgency: {
    padding: space.block,
    borderRadius: radius.card,
    marginBottom: space.block,
    ...shadow.card,
  },
  urgencyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  urgencyLabel: { flex: 1, letterSpacing: 0.56 },
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
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.row,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colour.line,
  },
  settingTitle: { flex: 1 },
})
