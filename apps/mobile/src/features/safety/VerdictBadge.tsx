import { StyleSheet, View } from 'react-native'
import type { SafetyAiVerdict } from '@lapka/contracts'
import { Text } from '@/ui/Text'
import { colour, radius, urgency } from '@/ui/theme'

/**
 * A verdict's colours, borrowed from the urgency scale so red still means one
 * thing across the app: danger reads as an emergency, caution as «watch»,
 * safe as healthy. «Нет данных» is not a level of risk, so it stays neutral.
 */
export function verdictTone(verdict: SafetyAiVerdict): { signal: string; background: string } {
  switch (verdict) {
    case 'danger':
      return urgency.emergency
    case 'caution':
      return urgency.monitor
    case 'safe':
      return urgency.healthy
    case 'unknown':
      return { signal: colour.muted, background: colour.soft }
  }
}

/** The caption on a list row: a small pill in the verdict's colours. */
export function VerdictBadge({ verdict, label }: { verdict: SafetyAiVerdict; label: string }) {
  const tone = verdictTone(verdict)
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
      <Text variant="caption" numberOfLines={1} style={{ color: tone.signal, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  )
}

/** The card's head: the verdict in capitals over its one-line answer. */
export function VerdictBlock({
  verdict,
  label,
  summary,
  children,
}: {
  verdict: SafetyAiVerdict
  label: string
  summary: string
  children?: React.ReactNode
}) {
  const tone = verdictTone(verdict)
  return (
    <View style={[styles.block, { backgroundColor: tone.background }]} accessible accessibilityLabel={`${label}. ${summary}`}>
      <Text variant="urgencyTitle" style={{ color: tone.signal }}>
        {label.toLocaleUpperCase()}
      </Text>
      <Text variant="h3" style={styles.summary}>
        {summary}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 24,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    justifyContent: 'center',
    flexShrink: 0,
  },
  block: { padding: 20, borderRadius: radius.card, marginBottom: 20 },
  summary: { marginTop: 8 },
})
