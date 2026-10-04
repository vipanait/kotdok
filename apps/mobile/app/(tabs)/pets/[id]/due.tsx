import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { DueRow } from '@/features/medical-record/DueRow'
import { doneRoute, dueItems, dueStatus } from '@/features/medical-record/due'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { ListSkeleton } from '@/ui/Skeleton'
import { colour } from '@/ui/theme'

/** Every due date of the pet (X-dates): overdue first, then the soonest. */
export default function AllDue() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()

  // The pet's record through the cache, shared by every screen of this pet:
  // the last one at once, a fresh one each time the screen comes into view.
  const record = useCached(['overview', id], () => withFreshSession((api) => api.getHealthOverview(id, localToday())))
  const overview = record.data
  const error = record.error ? describeFailure(t, record.error, t.errors.loadHealthFailed) : null
  const load = record.reload

  const today = localToday()
  const all = overview?.pet.id === id ? dueItems(overview.events) : []

  return (
    <Screen title={t.medicalRecord.allDueTitle} onBack={() => router.back()} scroll>
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
        </>
      ) : overview?.pet.id !== id ? (
        <ListSkeleton rows={4} />
      ) : null}
      {all.length > 0 ? (
        <Card outlined style={styles.card}>
          {all.map((due, index) => (
            <View key={due.itemId} style={index > 0 ? styles.divider : null}>
              <DueRow
                due={due}
                status={dueStatus(t, due.date, today)}
                onDone={() => router.push(doneRoute(id, due))}
              />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: { paddingVertical: 4, paddingHorizontal: 16 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line },
})
