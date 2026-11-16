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
  /** «Собакам» over the verdict, for a reference entry and an AI answer alike. Optional: a placeholder may lack it. */
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
        {/* Grows with the system font, up to twice its size, so it stays above the summary. A word is
            never split: one line per word at most, and a word too wide for the line shrinks the label
            instead (unbounded, «С осторожностью» broke mid-word at the largest sizes). */}
        <Text
          variant="h2"
          style={[styles.title, { color: tone.signal }]}
          maxFontSizeMultiplier={VERDICT_FONT_LIMIT}
          numberOfLines={label.split(/\s+/).length}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {label}
        </Text>
        <Text style={[styles.summary, { color: tone.signal }]}>{summary}</Text>
      </View>
      {children}
    </View>
  )
}

/** How far the verdict word may grow with the system font (see VerdictBlock). */
const VERDICT_FONT_LIMIT = 2

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
