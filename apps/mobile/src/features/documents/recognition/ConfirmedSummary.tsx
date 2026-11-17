import { StyleSheet, View } from 'react-native'
import { savedMerged, type SavedGroup } from '@lapka/shared'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'
import { Notice } from '../parts'
import { SourceLine } from './SourceLine'
import { savedLines } from './recognition-view'

/**
 * «Записи в медкарте» (design run «confirmed»): what was actually saved —
 * records per section, never the count selected, since two vaccines of one
 * day may be one record —, no empty group, the one source document, and
 * «Готово» to the saved records in the medical record.
 */
export function ConfirmedSummary({
  groups,
  source,
  onOpenSource,
  onDone,
}: {
  /** `savedSummary` of what the server answered. */
  groups: readonly SavedGroup[]
  source: { title: string }
  onOpenSource: () => void
  /** To the medical record, where the records now are. */
  onDone: () => void
}) {
  const t = useText()
  const words = t.documents.recognition.confirmed
  return (
    <View>
      <Notice tone="success" title={words.notice} body={words.body} />
      <View style={styles.list}>
        {savedLines(t, groups).map((line, index) => (
          <View key={line.section} accessible style={[styles.line, index > 0 ? styles.divider : null]}>
            <Text variant="bodyStrong" style={styles.fill}>
              {line.title}
            </Text>
            <Text tone="muted">{line.count}</Text>
          </View>
        ))}
      </View>
      {savedMerged(groups) ? (
        <Text variant="caption" tone="muted" style={styles.gap}>
          {words.merged}
        </Text>
      ) : null}
      <SourceLine title={source.title} onPress={onOpenSource} />
      <View style={styles.gap}>
        <Button title={words.done} onPress={onDone} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  list: { marginBottom: space.row },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.row, paddingVertical: space.row },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line },
  fill: { flexGrow: 1 },
  gap: { marginTop: space.row },
})
