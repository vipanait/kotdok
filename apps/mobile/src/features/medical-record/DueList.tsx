import { StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Text } from '@/ui/Text'
import { colour } from '@/ui/theme'
import { DueRow } from './DueRow'
import { dueGroups, marksFromRow, type Due } from './due'

/**
 * Due dates in groups: overdue first, then «Ближайшее», then «Позже»
 * (`dueGroups`). Shared by the record's «Сроки» card and «Все сроки», so the
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
            {group.rows.map(({ due, status }) => (
              <DueRow
                key={due.itemId}
                due={due}
                status={status}
                markable={marksFromRow(due.date, today)}
                onOpen={() => onOpen(due)}
                onDone={() => onDone(due)}
              />
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
  overdueRows: { gap: 20 },
  rows: { gap: 16 },
})
