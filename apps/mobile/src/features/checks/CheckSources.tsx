import { Linking, Pressable, StyleSheet, View } from 'react-native'
import type { SymptomCheckRecord } from '@lapka/contracts'
import { checkSources } from '@lapka/shared'
import { dictionary } from '@/i18n'
import { sourceLines } from '@/features/checks/check-sources-view'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * The materials of the vet knowledge base the analysis relied on (SRC-01).
 *
 * Titles and publishers only, each a link to the original: nothing of the
 * articles themselves is shown. The note under the list is there so that a
 * publisher's name next to the answer is not read as its endorsement. A check
 * without sources — an older one, or one the search found nothing for — has
 * no block at all.
 */
export function CheckSources({ check }: { check: Pick<SymptomCheckRecord, 'full_response' | 'locale'> }) {
  // The result's own language, as every other heading of the screen.
  const t = dictionary(check.locale)
  const lines = sourceLines(t, checkSources(check.full_response), check.locale)
  if (lines.length === 0) return null

  return (
    <View style={styles.section}>
      <Text variant="h3" style={styles.title}>
        {t.result.sourcesTitle}
      </Text>
      {lines.map((line) => (
        <Pressable
          key={line.url}
          accessibilityRole="link"
          accessibilityLabel={`${t.result.openSource}: ${line.title}, ${line.caption}`}
          onPress={() => void Linking.openURL(line.url)}
          style={styles.source}
        >
          <View style={styles.text}>
            <Text tone="accent">{line.title}</Text>
            <Text variant="label" tone="muted">
              {line.caption}
            </Text>
          </View>
          <Text tone="accent" accessibilityElementsHidden importantForAccessibility="no">
            ↗
          </Text>
        </Pressable>
      ))}
      <Text variant="caption" tone="faint" style={styles.note}>
        {t.result.sourcesNote}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 24, marginBottom: space.block },
  title: { marginBottom: space.row },
  // The arrow stays at the top right while a long title wraps beside it.
  source: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8 },
  text: { flex: 1, gap: 2 },
  note: { marginTop: 4 },
})
