import { StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Text } from '@/ui/Text'
import { colour } from '@/ui/theme'
import { DueRow } from './DueRow'
import { dueGroups, marksFromRow, type Due } from './due'

/**
 * Due dates in groups: overdue first, then «Ближайшее», then «Позже»
 * (`dueGroups`). Shared by the record's «Напоминания» card and «Все напоминания», so the
 * two cannot drift. It draws what it is given: the caller loads, cuts the
 * list to its limit and owns the routes.
 */
export function DueList({
  items,
  today,
  onOpen,
  onDone,
}: {
  items: readonly Due[]
  today: string
  onOpen: (due: Due) => void
  onDone: (due: Due) => void
}) {
  const t = useText()
  const headings = { soon: t.medicalRecord.dueUpcoming, later: t.medicalRecord.dueLater }

  return (
    <View>
      {dueGroups(t, items, today).map((group, index) => (
        <View key={group.tone} style={index > 0 ? styles.group : null}>
          {/* Overdue rows each say so; the other groups are named. */}
          {group.tone === 'overdue' ? null : (
            <Text variant="tab" accessibilityRole="header" style={styles.heading}>
              {headings[group.tone].toUpperCase()}
            </Text>
          )}
          <View style={group.tone === 'overdue' ? styles.overdueRows : styles.rows}>
            {/* A thin line between rows, as between doses in «Сегодня» (design 20 October 2026). */}
            {group.rows.map(({ due, status }, row) => (
              <View key={due.itemId}>
                {row > 0 ? <View style={styles.divider} /> : null}
                <DueRow
                  due={due}
                  status={status}
                  markable={marksFromRow(due.date, today)}
                  onOpen={() => onOpen(due)}
                  onDone={() => onDone(due)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginTop: 23 },
  heading: { color: colour.faint, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  overdueRows: {},
  rows: {},
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colour.line, marginVertical: 10 },
})
