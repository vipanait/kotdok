import { Pressable, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius } from '@/ui/theme'
import { dueLine, itemTitle, type Due, type DueStatus } from './due'

/**
 * One due date: what and when. The row opens its record; once the day has
 * come it also offers «Отметить» (`marksFromRow`, FB-1/01).
 *
 * Overdue is a word and a calendar with an exclamation in the text colour —
 * never the urgency scale's red or amber (spec §2.6, §8). Soon is teal; later
 * is just the date.
 */
export function DueRow({
  due,
  status,
  markable,
  onOpen,
  onDone,
}: {
  due: Due
  status: DueStatus
  markable: boolean
  onOpen: () => void
  onDone: () => void
}) {
  const t = useText()
  const title = itemTitle(t, due.item, due.kind)
  const line = dueLine(status)
  const tone =
    status.tone === 'overdue'
      ? { colour: colour.text, weight: '600' as const, icon: 'calendarAlert' as const }
      : status.tone === 'soon'
        ? { colour: colour.accentText, weight: '600' as const, icon: 'calendar' as const }
        : { colour: colour.muted, weight: '400' as const, icon: null }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${line}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={due.kind === 'parasite' ? 'parasite' : due.kind === 'visit' ? 'visit' : 'vaccine'} color={colour.text} />
      <View style={styles.copy}>
        <Text variant="h3">{title}</Text>
        <View style={styles.status}>
          {tone.icon ? <Icon name={tone.icon} size={16} color={tone.colour} /> : null}
          <Text variant="label" style={{ color: tone.colour, fontWeight: tone.weight, flexShrink: 1 }}>
            {line}
          </Text>
        </View>
      </View>
      {markable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.medicalRecord.markDue}: ${title}`}
          onPress={onDone}
          hitSlop={4}
          style={({ pressed }) => [styles.done, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text variant="label" tone="accent" style={styles.doneText}>
            {t.medicalRecord.markDue}
          </Text>
        </Pressable>
      ) : (
        <Icon name="chevron" size={18} color={colour.faint} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  done: {
    minHeight: TAP_TARGET - 8,
    minWidth: TAP_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colour.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontWeight: '600' },
})
