import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthEvent } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { dueLine, dueStatus, itemName, targetList } from '@/features/medical-record/due'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'

/**
 * One record (M21 for a plan, X-record for a done one). A plan is marked done,
 * moved or cancelled; a done record is corrected or deleted. The two
 * confirmations say different things: cancelling a plan loses a reminder,
 * deleting a record loses history (spec §7.14).
 */
export default function EventView() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>()
  const t = useText()
  const words = t.medicalRecord
  const [event, setEvent] = useState<HealthEvent | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const overview = await withFreshSession((api) => api.getHealthOverview(id))
      const found = overview.events.find((e) => e.id === eventId)
      // A plan fully marked done moves its last item into a new record; there
      // is nothing left to show here, so go back to the list.
      if (!found) {
        router.back()
        return
      }
      setEvent(found)
    } catch (cause) {
      setError(describeFailure(t, cause, words.loadEventFailed))
    }
  }, [id, eventId, t, words.loadEventFailed])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function remove() {
    setBusy(true)
    try {
      await withFreshSession((api) => api.deleteHealthEvent(id, eventId))
      setAsking(false)
      router.back()
    } catch (cause) {
      setAsking(false)
      setError(describeFailure(t, cause, words.deleteEventFailed))
    } finally {
      setBusy(false)
    }
  }

  const complete = (itemId: string) => router.push(`/pets/${id}/event-form?mode=complete&itemId=${itemId}`)
  const edit = () => router.push(`/pets/${id}/event-form?mode=edit&eventId=${eventId}`)

  const planned = event?.status === 'planned'
  const status = event && planned ? dueStatus(t, event.date, localToday()) : null
  const single = event?.items.length === 1

  return (
    <Screen
      title={words.vaccinationTitle}
      onBack={() => router.back()}
      scroll
      dock={
        event ? (
          planned ? (
            <>
              {single ? <Button title={words.markDone} onPress={() => complete(event.items[0].id)} /> : null}
              <LinkButton title={words.reschedule} onPress={edit} />
            </>
          ) : (
            <Button title={words.edit} kind="secondary" onPress={edit} />
          )
        ) : null
      }
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
        </>
      ) : null}

      {event ? (
        <>
          <Card outlined style={styles.head}>
            <View style={styles.badge}>
              <Text variant="label">{planned ? words.plannedBadge : words.doneBadge}</Text>
            </View>
            <Text variant="h2">{t.day(event.date, true)}</Text>
            {status && status.tone !== 'later' ? (
              <Text
                variant="label"
                style={{ color: status.tone === 'overdue' ? colour.text : colour.accentText, fontWeight: '600' }}
              >
                {dueLine(status)}
              </Text>
            ) : null}
            {event.clinic ? <Text tone="muted">{event.clinic}</Text> : null}
          </Card>

          {event.items.map((item) => (
            <Card key={item.id} outlined style={styles.item}>
              <Text variant="bodyStrong">{itemName(t, item)}</Text>
              {item.name && item.targets.length > 0 ? (
                <Text tone="muted">{targetList(t, item.targets)}</Text>
              ) : null}
              {planned && !single ? (
                <View style={styles.itemDone}>
                  <Button title={words.markDone} kind="secondary" onPress={() => complete(item.id)} />
                </View>
              ) : null}
            </Card>
          ))}

          {event.notes ? (
            <View style={styles.notes}>
              <Text variant="label" tone="muted">
                {words.notesLabel}
              </Text>
              <Text>{event.notes}</Text>
            </View>
          ) : null}

          <LinkButton
            title={planned ? words.cancelPlan : words.deleteEvent}
            align="left"
            onPress={() => setAsking(true)}
          />
        </>
      ) : null}

      <ConfirmDialog
        visible={asking}
        title={planned ? words.cancelPlanTitle : words.deleteEventTitle}
        message={planned ? words.cancelPlanBody : words.deleteEventBody}
        confirmTitle={planned ? words.cancelPlanConfirm : t.pets.removeConfirm}
        cancelTitle={planned ? words.keepPlan : undefined}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { padding: 20, gap: 8 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colour.soft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  item: { padding: 16, gap: 4 },
  itemDone: { marginTop: space.row },
  notes: { marginVertical: space.row, gap: 2 },
})
