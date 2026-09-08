import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Icon } from './Icon'
import { Text } from './Text'
import { CONTROL_HEIGHT, colour, radius, space } from './theme'

/**
 * A section that opens.
 *
 * The pet form is sixteen fields long. Grouped behind three of these, the six
 * that everyone fills in are on screen at once and the rest are one tap away —
 * which is the difference between a form people finish and one they abandon.
 */
export function Accordion({
  title,
  count,
  children,
  initiallyOpen = false,
  soft = false,
}: {
  title: string
  count?: string
  children: ReactNode
  initiallyOpen?: boolean
  soft?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)

  return (
    <View style={soft ? styles.accordionSoft : styles.accordion}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen((was) => !was)}
        style={styles.summary}
      >
        <Text variant={soft ? 'body' : 'h3'} style={styles.summaryTitle}>
          {title}
        </Text>
        {count ? (
          <Text variant="caption" tone="faint">
            {count}
          </Text>
        ) : null}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="down" size={16} color={colour.faint} />
        </View>
      </Pressable>
      {open ? (
        <View style={soft ? styles.insideSoft : styles.inside}>{children}</View>
      ) : null}
    </View>
  )
}

/** How far through a two-step form this is. */
export function Steps({ current, of }: { current: number; of: number }) {
  return (
    <View style={styles.stepsBlock}>
      <Text variant="caption" tone="faint" style={styles.stepMeta}>
        Шаг {current} из {of}
      </Text>
      <View style={styles.steps}>
        {Array.from({ length: of }, (_, index) => (
          <View
            key={index}
            style={[styles.stepBar, index < current ? styles.stepBarDone : null]}
          />
        ))}
      </View>
    </View>
  )
}

/** What the previous step captured, with a way back to change it. */
export function SummaryCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.summaryCard, style]}>{children}</View>
}

/** A list of short statements, each on its own bullet. */
export function Bullets({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null

  return (
    <View style={styles.resultSection}>
      <Text variant="h3" style={styles.resultTitle}>
        {title}
      </Text>
      {items.map((item, index) => (
        <View key={`${index}-${item.slice(0, 16)}`} style={styles.bullet}>
          <Text tone="accent" style={styles.dot}>
            •
          </Text>
          <Text tone="muted" style={styles.bulletText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  accordion: { borderBottomWidth: 1, borderBottomColor: colour.line },
  accordionSoft: {
    backgroundColor: colour.soft,
    borderRadius: radius.field,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: space.block,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: CONTROL_HEIGHT,
  },
  summaryTitle: { flex: 1 },
  inside: { paddingTop: space.block },
  insideSoft: { paddingBottom: 16 },

  stepsBlock: { marginBottom: 24 },
  stepMeta: { marginBottom: 8 },
  steps: { flexDirection: 'row', gap: 8 },
  stepBar: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colour.line },
  stepBarDone: { backgroundColor: colour.accent },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: colour.soft,
    borderRadius: radius.field,
    marginBottom: space.block,
  },

  resultSection: { marginTop: 24 },
  resultTitle: { marginBottom: space.row },
  bullet: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
})
