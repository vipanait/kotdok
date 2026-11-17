import { Pressable, StyleSheet, View } from 'react-native'
import type { DraftEntry } from '@lapka/shared'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Icon } from '@/ui/Icon'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius, space } from '@/ui/theme'
import { StatusTag } from '../parts'
import { entryHint, entryRow } from './recognition-view'

/**
 * One suggested record (design run «review», «recipe»): a checkbox that says
 * its name, state and what it lacks; the day, the essentials; what the
 * document was unsure of and what is missing, said next to it; a possible
 * duplicate pointing at the real record only when the server named it.
 * «Изменить» opens it with its values; «Страница N» the page it was read
 * from. An incomplete entry cannot be ticked until it is completed.
 */
export function ReviewEntry({
  entry,
  selected,
  onToggle,
  onEdit,
  onOpenPage,
  onOpenRecord,
  editRef,
}: {
  entry: DraftEntry
  selected: boolean
  onToggle: (on: boolean) => void
  onEdit: () => void
  onOpenPage: () => void
  /** The existing record a duplicate matches; absent when there is nowhere to go. */
  onOpenRecord?: (recordId: string) => void
  /** «Изменить», for the focus to come back to after the edit. */
  editRef?: (node: View | null) => void
}) {
  const t = useText()
  const words = t.documents.recognition.review
  const row = entryRow(t, entry)
  const recordId = row.duplicate?.recordId ?? null

  return (
    <View style={[styles.entry, selected ? styles.entrySelected : null]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled: !row.selectable }}
        accessibilityLabel={words.select(row.title)}
        accessibilityHint={entryHint(row)}
        disabled={!row.selectable}
        onPress={() => onToggle(!selected)}
        style={({ pressed }) => [styles.select, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.box, selected ? styles.boxOn : null, !row.selectable ? styles.boxOff : null]}>
          {selected ? <Icon name="tick" size={18} color={colour.surface} /> : null}
        </View>
        <View style={styles.copy}>
          <Text variant="h3" tone={row.named ? 'default' : 'danger'}>
            {row.title}
          </Text>
          <Text variant="label" tone={row.date.missing ? 'danger' : 'muted'}>
            {row.date.text}
          </Text>
          {row.details.map((line, index) => (
            <Text key={index} variant="label" tone="muted">
              {line}
            </Text>
          ))}
        </View>
      </Pressable>

      {row.unsure || row.missing.length > 0 || row.duplicate ? (
        <View style={styles.flags}>
          {row.unsure ? (
            <View style={styles.flag}>
              <StatusTag text={words.unsure} />
              <Text variant="label">{row.unsure}</Text>
            </View>
          ) : null}
          {row.missing.map((text, index) => (
            <Text key={index} variant="caption" tone="danger">
              {text}
            </Text>
          ))}
          {row.duplicate ? (
            <View style={styles.flag}>
              <StatusTag text={row.duplicate.text} />
              {recordId && onOpenRecord ? (
                <LinkButton title={words.duplicateOpen} align="left" onPress={() => onOpenRecord(recordId)} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.links}>
        <Pressable
          ref={editRef}
          accessibilityRole="button"
          accessibilityLabel={words.editLabel(row.title)}
          onPress={onEdit}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text variant="bodyStrong" tone="accent" maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
            {words.edit}
          </Text>
        </Pressable>
        <LinkButton title={words.page(entry.page)} accessibilityLabel={words.pageLabel(entry.page, row.title)} onPress={onOpenPage} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  entry: {
    paddingVertical: space.row,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
    gap: 6,
  },
  entrySelected: { borderColor: colour.accent },
  select: { flexDirection: 'row', alignItems: 'flex-start', gap: space.row, minHeight: TAP_TARGET },
  box: {
    width: 28,
    height: 28,
    marginTop: 8,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colour.line,
    backgroundColor: colour.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colour.accent, borderColor: colour.accent },
  boxOff: { backgroundColor: colour.soft },
  copy: { flex: 1, minWidth: 0, gap: 2, paddingTop: 10 },
  flags: { gap: 6, paddingLeft: 40 },
  flag: { gap: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.block, paddingLeft: 40 },
  link: { minHeight: TAP_TARGET, minWidth: TAP_TARGET, justifyContent: 'center', paddingVertical: 10 },
})
