import { Pressable, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { colour, due as dueColour } from '@/ui/theme'
import { dueLine, itemTitle, type Due, type DueStatus } from './due'

/** The visible button; the area a finger may hit is 44 (`hitSlop`). */
const MARK_HEIGHT = 36
const ICON_BOX = 36
const ICON_GAP = 12

/**
 * One due date: what and when. The row opens its record; once the day has
 * come it also offers «Отметить» (`marksFromRow`, FB-1/01) — a button of its
 * own beside the row, so a press on it never opens the record too.
 *
 * Overdue is drawn apart (due priority design, 20 October 2026): a
 * terracotta line and the status in words above the title. The colour only
 * repeats what the words say, and it is not the urgency scale: a missed date,
 * not a medical alarm. Soon is the relative day in teal; later is just the
 * date. The tick on «Отметить» belongs to the button — it does not mean done.
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
  const title = itemTitle(t, due.item, due.kind)
  const overdue = status.tone === 'overdue'

  return (
    <View style={overdue ? styles.overdue : null}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${dueLine(status)}`}
        onPress={onOpen}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        {overdue ? (
          <Text variant="caption" style={styles.overdueStatus}>
            {status.text}
          </Text>
        ) : null}
        <View style={styles.head}>
          <View style={styles.iconBox}>
            <Icon name={due.kind === 'parasite' ? 'parasite' : due.kind === 'visit' ? 'visit' : 'vaccine'} size={20} />
          </View>
          <View style={styles.copy}>
            <Text variant="h3" style={styles.title}>
              {title}
            </Text>
            <DateLine status={status} planned={t.medicalRecord.duePlannedDate} />
          </View>
          {markable ? null : <Icon name="chevron" size={18} color={colour.faint} />}
        </View>
      </Pressable>
      {markable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.medicalRecord.markDue}: ${title}`}
          onPress={onDone}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          style={({ pressed }) => [styles.mark, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="tick" size={16} color={colour.surface} />
          <Text variant="label" maxFontSizeMultiplier={CONTROL_FONT_LIMIT} style={styles.markText}>
            {t.medicalRecord.markDue}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Under the title: the planned day of an overdue row (unless its status
 * already names it, `dated`), «Завтра · 20 октября» for a soon one, the bare
 * date for a later one.
 */
function DateLine({ status, planned }: { status: DueStatus; planned: string }) {
  if (status.tone === 'overdue') {
    return status.dated ? null : (
      <Text variant="label" style={styles.date}>
        {`${planned} · ${status.day}`}
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
  overdue: { borderLeftWidth: 3, borderLeftColor: dueColour.overdue, paddingLeft: 14 },
  overdueStatus: { color: dueColour.overdue, fontWeight: '700', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: ICON_GAP },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: 11,
    backgroundColor: dueColour.iconBox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: '700' },
  date: { color: dueColour.date },
  soon: { color: colour.accentText, fontWeight: '700' },
  mark: {
    alignSelf: 'flex-start',
    marginTop: 12,
    marginLeft: ICON_BOX + ICON_GAP,
    minHeight: MARK_HEIGHT,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: colour.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  markText: { color: colour.surface, fontWeight: '700' },
})
