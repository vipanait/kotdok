import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthOverview } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { DueRow } from '@/features/medical-record/DueRow'
import { dueItems, dueStatus } from '@/features/medical-record/due'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { colour } from '@/ui/theme'

/** Every due date of the pet (X-dates): overdue first, then the soonest. */
export default function AllDue() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const [overview, setOverview] = useState<HealthOverview | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOverview(await withFreshSession((api) => api.getHealthOverview(id)))
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.loadHealthFailed))
    }
  }, [id, t])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const today = localToday()
  const all = overview?.pet.id === id ? dueItems(overview.events) : []

  return (
    <Screen title={t.medicalRecord.allDueTitle} onBack={() => router.back()} scroll>
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
        </>
      ) : null}
      {all.length > 0 ? (
        <Card outlined style={styles.card}>
          {all.map((due, index) => (
            <View key={due.itemId} style={index > 0 ? styles.divider : null}>
              <DueRow
                due={due}
                status={dueStatus(t, due.date, today)}
                onDone={() => router.push(`/pets/${id}/event-form?mode=complete&itemId=${due.itemId}&kind=${due.kind}`)}
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
