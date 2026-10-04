import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native'
import { useText } from '@/i18n'
import { colour, radius, shadow, space } from './theme'

/**
 * The shape of a screen while its data is on the way.
 *
 * A spinner on an empty page says nothing about what is coming and makes the
 * page jump when it arrives; blanks in the places the content will take keep
 * it still. The same soft fill as the pet list's and the record's own blanks,
 * so every screen loads the same way.
 *
 * A screen reader hears one «Загрузка» for the whole group, not a list of
 * empty boxes.
 */
function Loading({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useText()
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t.common.loading}
      accessibilityState={{ busy: true }}
    >
      {children}
    </View>
  )
}

/** One blank: a line of text, a field, a picture. */
export function Blank({
  width = '100%',
  height = 14,
  round = false,
  style,
}: {
  width?: DimensionValue
  height?: number
  round?: boolean
  style?: ViewStyle
}) {
  return (
    <View
      style={[styles.blank, { width, height }, round ? { borderRadius: radius.pill } : null, style]}
    />
  )
}

/** Two lines of text, the second shorter: a title and what is under it. */
function Lines({ first = '70%', second = '45%' }: { first?: DimensionValue; second?: DimensionValue }) {
  return (
    <View style={styles.lines}>
      <Blank width={first} height={16} />
      <Blank width={second} />
    </View>
  )
}

/** Cards in a column, as in a list of pets, checks or records. */
export function ListSkeleton({ rows = 3, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <Loading>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={styles.card}>
          {avatar ? <Blank width={48} height={48} round /> : null}
          <Lines />
        </View>
      ))}
    </Loading>
  )
}

/** A form: a label over a field, as many as the form has on its first screen. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Loading>
      {Array.from({ length: fields }, (_, field) => (
        <View key={field} style={styles.field}>
          <Blank width={field % 2 ? '30%' : '40%'} height={12} />
          <Blank height={52} style={styles.control} />
        </View>
      ))}
    </Loading>
  )
}

/** One record read on its own: a card of lines, then the facts under it. */
export function DetailSkeleton({ facts = 3 }: { facts?: number }) {
  return (
    <Loading>
      <View style={[styles.card, styles.column]}>
        <Blank width="55%" height={20} />
        <Blank width="80%" />
        <Blank width="65%" />
      </View>
      {Array.from({ length: facts }, (_, fact) => (
        <View key={fact} style={styles.fact}>
          <Blank width="30%" height={12} />
          <Blank width={fact % 2 ? '50%' : '75%'} height={16} />
        </View>
      ))}
    </Loading>
  )
}

/** A check's answer: the urgency card, then sections of bullets. */
export function ResultSkeleton() {
  return (
    <Loading>
      <Blank width="35%" height={12} style={styles.caption} />
      <View style={[styles.urgency, styles.column]}>
        <Blank width="40%" height={24} />
        <Blank width="85%" />
        <Blank width="70%" />
      </View>
      {[0, 1].map((section) => (
        <View key={section} style={styles.section}>
          <Blank width="45%" height={18} />
          <Blank width="90%" />
          <Blank width="80%" />
          <Blank width="60%" />
        </View>
      ))}
    </Loading>
  )
}

/** A chart's block above a list, as on the weight screen. */
export function ChartSkeleton() {
  return (
    <Loading>
      <View style={[styles.card, styles.column]}>
        <Blank width="30%" height={28} />
        <Blank height={160} />
      </View>
      <ListSkeleton rows={2} />
    </Loading>
  )
}

const styles = StyleSheet.create({
  blank: { backgroundColor: colour.soft, borderRadius: radius.field },
  lines: { flex: 1, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    marginBottom: space.row,
    backgroundColor: colour.surface,
    borderRadius: radius.card,
    ...shadow.card,
  },
  column: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  field: { marginBottom: space.block },
  control: { marginTop: 6 },
  fact: { gap: 6, marginBottom: space.block },
  caption: { marginBottom: space.row },
  urgency: {
    padding: space.block,
    borderRadius: radius.card,
    backgroundColor: colour.surface,
    marginBottom: space.block,
    ...shadow.card,
  },
  section: { marginTop: 24, gap: 10 },
})
