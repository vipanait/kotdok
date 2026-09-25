import { Pressable, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius } from '@/ui/theme'
import { dueLine, itemTitle, type Due, type DueStatus } from './due'

/**
 * One due date: what, when, and «Сделано».
 *
 * Overdue is a word and a calendar with an exclamation in the text colour —
 * never the urgency scale's red or amber (spec §2.6, §8). Soon is teal; later
 * is just the date.
 */
export function DueRow({ due, status, onDone }: { due: Due; status: DueStatus; onDone: () => void }) {
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
    <View style={styles.row}>
      <Icon name={due.kind === 'parasite' ? 'parasite' : 'vaccine'} color={colour.text} />
      <View style={styles.copy} accessible accessibilityLabel={`${title}, ${line}`}>
        <Text variant="h3">{title}</Text>
        <View style={styles.status}>
          {tone.icon ? <Icon name={tone.icon} size={16} color={tone.colour} /> : null}
          <Text variant="label" style={{ color: tone.colour, fontWeight: tone.weight, flexShrink: 1 }}>
            {line}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.medicalRecord.markDone}: ${title}`}
        onPress={onDone}
        hitSlop={4}
        style={({ pressed }) => [styles.done, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text variant="label" tone="accent" style={styles.doneText}>
          {t.medicalRecord.markDone}
        </Text>
      </Pressable>
    </View>
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
