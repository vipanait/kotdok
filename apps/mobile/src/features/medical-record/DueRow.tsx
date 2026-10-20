import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { colour, due as dueColour } from '@/ui/theme'
import { dueLine, itemTitle, type Due, type DueStatus } from './due'

const ICON_BOX = 36
const ICON_GAP = 12
/** Narrower than this, or with a large system font, «Отметить» goes under the text. */
const SIDE_BY_SIDE_MIN_WIDTH = 360
const SIDE_BY_SIDE_MAX_FONT = 1.2

/**
 * One due date: what and when. The row opens its record; once the day has
 * come it also offers «Отметить» (`marksFromRow`, FB-1/01) — a button of its
 * own beside the row, so a press on it never opens the record too.
 *
 * Overdue is said in words under the date, in the colour and size of «Не
 * отмечено» under a dose (block «Напоминания», design 20 October 2026) — no
 * line, fill or mark beside it: a missed date, not a medical alarm. Soon is
 * the relative day in teal; later is just the date.
 *
 * «Отметить» is a compact secondary button on the right, like «Дали»; where
 * it would squeeze the title into a column too narrow to read, it moves under
 * the text instead.
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
  const { width, fontScale } = useWindowDimensions()
  const stacked = width < SIDE_BY_SIDE_MIN_WIDTH || fontScale > SIDE_BY_SIDE_MAX_FONT
  const title = itemTitle(t, due.item, due.kind)
  const overdue = status.tone === 'overdue'

  return (
    <View style={[styles.row, stacked ? styles.stacked : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${dueLine(status)}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.open, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={styles.head}>
          <View style={styles.iconBox}>
            <Icon name={due.kind === 'parasite' ? 'parasite' : due.kind === 'visit' ? 'visit' : 'vaccine'} size={22} />
          </View>
          <View style={styles.copy}>
            {/* As a medicine's name in «Сегодня». */}
            <Text>{title}</Text>
            <DateLine status={status} />
            {/* Words, as «Не отмечено» under a dose: the colour only repeats them. */}
            {overdue ? (
              <Text variant="caption" tone="danger">
                {status.text}
              </Text>
            ) : null}
          </View>
          {markable ? null : <Icon name="chevron" size={18} color={colour.faint} />}
        </View>
      </Pressable>
      {/* A button of its own beside the row's area: a press on it never opens the record too. */}
      {markable ? (
        <Button
          title={t.medicalRecord.markDue}
          accessibilityLabel={`${t.medicalRecord.markDue}: ${title}`}
          kind="secondary"
          compact
          onPress={onDone}
          style={stacked ? styles.markStacked : undefined}
        />
      ) : null}
    </View>
  )
}

/**
 * Under the title: the planned day of an overdue row (unless its status
 * already names it, `dated`) — the bare date, its status on the next line
 * (design 20 October 2026) — «Завтра · 20 октября» for a soon one, the bare
 * date for a later one.
 */
function DateLine({ status }: { status: DueStatus }) {
  if (status.tone === 'overdue') {
    return status.dated ? null : (
      <Text variant="label" style={styles.date}>
        {status.day}
      </Text>
    )
  }
  if (status.tone === 'soon' && status.text) {
    return (
      <Text variant="label" style={styles.date}>
        <Text variant="label" style={styles.soon}>
          {status.text}
        </Text>
        {` · ${status.day}`}
      </Text>
    )
  }
  return (
    <Text variant="label" style={styles.date}>
      {status.day}
    </Text>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: ICON_GAP },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  open: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: ICON_GAP },
  // The outline icon alone, on the row's own background (design 20 October 2026).
  iconBox: { width: ICON_BOX, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  date: { color: dueColour.date },
  soon: { color: colour.accentText, fontWeight: '700' },
  markStacked: { alignSelf: 'flex-start', marginLeft: ICON_BOX + ICON_GAP },
})
