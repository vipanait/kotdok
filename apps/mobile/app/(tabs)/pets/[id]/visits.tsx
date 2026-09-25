import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthEvent, HealthOverview } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { dueLine, dueStatus } from '@/features/medical-record/due'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'

/** Vet visits (M17): planned ones first, then those that happened. */
export default function Visits() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.medicalRecord.visits
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

  const shown = overview?.pet.id === id ? overview : null
  const today = localToday()
  const visits = (shown?.events ?? []).filter((event) => event.kind === 'visit')
  const planned = visits.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))
  const done = visits.filter((e) => e.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
  const add = () => router.push(`/pets/${id}/visit-form`)

  function VisitCard({ visit }: { visit: HealthEvent }) {
    const status = visit.status === 'planned' ? dueStatus(t, visit.date, today) : null
    const line = visit.diagnosis ?? visit.reason
    const kind = visit.visit_kind ? words.kindsShort[visit.visit_kind] : null
    return (
      <Card
        outlined
        onPress={() => router.push(`/pets/${id}/visit/${visit.id}`)}
        accessibilityLabel={[t.day(visit.date, true), kind, visit.clinic, status && status.tone !== 'later' ? dueLine(status) : null, line]
          .filter(Boolean)
          .join(', ')}
        style={styles.card}
      >
        <View style={styles.head}>
          <Text variant="h3" style={styles.fill}>
            {t.day(visit.date, true)}
          </Text>
          {kind ? (
            <View style={styles.pill}>
              <Text variant="label">{kind}</Text>
            </View>
          ) : null}
        </View>
        {status && status.tone !== 'later' ? (
          <Text variant="label" style={{ color: status.tone === 'overdue' ? colour.text : colour.accentText, fontWeight: '600' }}>
            {dueLine(status)}
          </Text>
        ) : null}
        {visit.clinic ? <Text tone="muted">{visit.clinic}</Text> : null}
        {line ? (
          <Text tone="muted" numberOfLines={1}>
            {line}
          </Text>
        ) : null}
      </Card>
    )
  }

  return (
    <Screen
      title={words.title}
      onBack={() => router.back()}
      action={shown ? { icon: 'plus', label: words.add, onPress: add } : undefined}
      scroll
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
        </>
      ) : null}

      {shown && visits.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="visit" size={56} color={colour.line} />
          <Text variant="h2" center>
            {words.emptyTitle}
          </Text>
          <Text tone="muted" center>
            {words.emptyBody}
          </Text>
          <Button title={words.add} onPress={add} />
        </View>
      ) : null}

      {planned.length > 0 ? (
        <>
          <Text variant="h2" style={styles.group}>
            {t.medicalRecord.plannedGroup}
          </Text>
          {planned.map((visit) => (
            <VisitCard key={visit.id} visit={visit} />
          ))}
        </>
      ) : null}
      {done.length > 0 ? (
        <>
          <Text variant="h2" style={styles.group}>
            {t.medicalRecord.doneGroup}
          </Text>
          {done.map((visit) => (
            <VisitCard key={visit.id} visit={visit} />
          ))}
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.row, marginTop: space.section },
  group: { marginBottom: space.row },
  card: { gap: 4, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fill: { flex: 1 },
  pill: { backgroundColor: colour.soft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
})
