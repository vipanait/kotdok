import { StyleSheet, View } from 'react-native'
import { Card } from '@/ui/Card'
import { Icon, type IconName } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * One way to go on (onboarding): an outline icon, what it is, a line on what
 * it gives, a chevron. The whole card is the button. `lead` marks the one
 * the screen is mostly for — a tint, never the only difference.
 */
export function ChoiceRow({
  icon,
  title,
  body,
  lead = false,
  onPress,
}: {
  icon: IconName
  title: string
  body: string
  lead?: boolean
  onPress: () => void
}) {
  return (
    <Card
      onPress={onPress}
      outlined={!lead}
      accessibilityLabel={`${title}. ${body}`}
      style={lead ? { ...styles.row, ...styles.lead } : styles.row}
    >
      <Icon name={icon} color={colour.accentText} />
      <View style={styles.copy}>
        <Text variant="h3">{title}</Text>
        <Text variant="label" tone="muted">
          {body}
        </Text>
      </View>
      <Icon name="chevron" size={20} color={colour.faint} />
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.row, minHeight: 88, marginBottom: space.row },
  lead: { backgroundColor: colour.accentSoft, shadowOpacity: 0, elevation: 0 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
})
