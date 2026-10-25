import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import type { HealthEvent } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useCached } from '@/lib/query-cache'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { useRecordChanged } from '@/features/medical-record/record-cache'
import { dueLine, dueStatus, itemName, marksFromRow, targetList } from '@/features/medical-record/due'
import { AddToCalendar } from '@/features/medical-record/AddToCalendar'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { DetailSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'

/**
 * One record (M21 for a plan, X-record for a done one). A plan is marked done,
 * moved or cancelled; a done record is only read or deleted — something done
 * is history and is not corrected (owner rule of 26 September 2026; the
 * server refuses it with record_done). The two
 * confirmations say different things: cancelling a plan loses a reminder,
 * deleting a record loses history (spec §7.14).
 */
export default function EventView() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>()
  const t = useText()
  const changed = useRecordChanged()
  const words = t.medicalRecord
  // The pet's record through the cache shared by its screens: this record is one of its events.
  const record = useCached(queryKeys.overview(id), () => withFreshSession((api) => api.getHealthOverview(id, localToday())))
  const event: HealthEvent | null = useMemo(() => record.data?.events.find((e) => e.id === eventId) ?? null, [record.data, eventId])
  const petName = record.data?.pet.name ?? ''
  const [actionError, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const error = actionError ?? (record.error ? describeFailure(t, record.error, words.loadEventFailed) : null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  // A record deleted elsewhere, or gone since the list was read: nothing left
  // to show here, so back to the list — once, also when it was this screen that deleted it.
  const leaving = useRef(false)
  useEffect(() => {
    if (record.data && !event && !leaving.current) {
      leaving.current = true
      router.back()
    }
  }, [record.data, event])

  async function remove() {
    setBusy(true)
    try {
      await withFreshSession((api) => api.deleteHealthEvent(id, eventId))
      void changed(id)
      setAsking(false)
      leaving.current = true
      router.back()
    } catch (cause) {
      setAsking(false)
      setError(describeFailure(t, cause, words.deleteEventFailed))
    } finally {
      setBusy(false)
    }
  }

  const kind = event?.kind ?? 'vaccination'
  const complete = (itemId: string) => router.push(`/pets/${id}/event-form?mode=complete&itemId=${itemId}&kind=${kind}`)
  const edit = () => router.push(`/pets/${id}/event-form?mode=edit&eventId=${eventId}&kind=${kind}`)

  const planned = event?.status === 'planned'
  const status = event && planned ? dueStatus(t, event.date, localToday()) : null
  const single = event?.items.length === 1
  const ahead = event ? !marksFromRow(event.date, localToday()) : false

  return (
    <Screen
      title={!event ? words.recordTitle : event.kind === 'parasite' ? words.treatmentTitle : words.vaccinationTitle}
      onBack={() => router.back()}
      scroll
      dock={
        event ? (
          planned ? (
            // A date still ahead is moved, not marked: «Сделано» as the main
            // button beside «Завтра» read as a status (FB-1/01).
            ahead ? (
              <>
                <Button title={words.reschedule} kind="secondary" onPress={edit} />
                {single ? <LinkButton title={words.markDoneEarly} onPress={() => complete(event.items[0].id)} /> : null}
              </>
            ) : (
              <>
                {single ? <Button title={words.markDone} onPress={() => complete(event.items[0].id)} /> : null}
                <LinkButton title={words.reschedule} onPress={edit} />
              </>
            )
          ) : null
        ) : null
      }
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void record.reload()} />
        </>
      ) : !event ? (
        <DetailSkeleton />
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
          {/* A day already past is not put in a calendar (PR #82 review). */}
          {planned && event.date >= localToday() ? <AddToCalendar petName={petName} event={event} /> : null}

          {event.items.map((item) => (
            <Card key={item.id} outlined style={styles.item}>
              <Text variant="bodyStrong">{itemName(t, item)}</Text>
              {item.name && item.targets.length > 0 ? (
                <Text tone="muted">{targetList(t, item.targets)}</Text>
              ) : null}
              {planned && !single ? (
                <View style={styles.itemDone}>
                  <Button title={ahead ? words.markDoneEarly : words.markDone} kind="secondary" onPress={() => complete(item.id)} />
                </View>
              ) : null}
            </Card>
          ))}

          {!planned ? <Text tone="muted">{words.doneReadOnly}</Text> : null}

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
