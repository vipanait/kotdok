import { StyleSheet, View } from 'react-native'
import type { SafetyAiVerdict } from '@lapka/contracts'
import { Text } from '@/ui/Text'
import { colour, radius, urgency } from '@/ui/theme'

/**
 * A verdict's colours, borrowed from the urgency scale so red still means one
 * thing across the app: danger reads as an emergency, caution as «watch»,
 * safe as the turquoise of «care at home» (pet-safety-v1 handoff §4, as on
 * the site). «Нет данных» is not a level of risk, so it stays neutral. The
 * colour always stands next to the verdict's word.
 */
export function verdictTone(verdict: SafetyAiVerdict): { signal: string; background: string } {
  switch (verdict) {
    case 'danger':
      return urgency.emergency
    case 'caution':
      return urgency.monitor
    case 'safe':
      return urgency.home_care
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

/** The card's head: whom it is about, the verdict, and its one-line answer, in the verdict's colours. */
export function VerdictBlock({
  verdict,
  label,
  summary,
  forWhom,
  children,
}: {
  verdict: SafetyAiVerdict
  label: string
  summary: string
  /** «Собакам» over the verdict; none for an AI answer that already says whom it is for. */
  forWhom?: string
  children?: React.ReactNode
}) {
  const tone = verdictTone(verdict)
  return (
    <View style={[styles.block, { backgroundColor: tone.background }]}>
      <View accessible accessibilityLabel={[forWhom, label, summary].filter(Boolean).join('. ')}>
        {forWhom ? (
          <Text variant="label" tone="muted">
            {forWhom}
          </Text>
        ) : null}
        {/* Grows with the system font like the summary under it: capped, it ended up smaller than its
            own explanation. At the largest sizes a long label may break mid-word; it stays the larger. */}
        <Text variant="h2" style={[styles.title, { color: tone.signal }]}>
          {label}
        </Text>
        <Text style={[styles.summary, { color: tone.signal }]}>{summary}</Text>
      </View>
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
  block: { padding: 18, borderRadius: radius.card, marginBottom: 16 },
  title: { marginTop: 2, fontSize: 24, lineHeight: 30, fontWeight: '800' },
  summary: { marginTop: 6 },
})
