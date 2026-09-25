import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthEvent, HealthOverview } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { dueLine, dueStatus, itemName, parasiteStatuses } from '@/features/medical-record/due'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * Parasite treatments (M8, X-parasites-empty): where fleas-and-ticks and
 * worms stand, then the plans and the records. A combined product shows in
 * both cards and is still one record and one due date.
 */
export default function Parasites() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.medicalRecord
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
  const treatments = (shown?.events ?? []).filter((event) => event.kind === 'parasite')
  const planned = treatments.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))
  const done = treatments.filter((e) => e.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
  const add = () => router.push(`/pets/${id}/event-form?mode=new&status=done&kind=parasite`)

  function EventCard({ event }: { event: HealthEvent }) {
    const status = event.status === 'planned' ? dueStatus(t, event.date, today) : null
    const names = event.items.map((item) => itemName(t, item))
    return (
      <Card
        outlined
        onPress={() => router.push(`/pets/${id}/event/${event.id}`)}
        accessibilityLabel={[t.day(event.date, true), status && status.tone !== 'later' ? dueLine(status) : null, ...names]
          .filter(Boolean)
          .join(', ')}
        style={styles.card}
      >
        <Text variant="h3">{t.day(event.date, true)}</Text>
        {status && status.tone !== 'later' ? (
          <View style={styles.status}>
            <Icon
              name={status.tone === 'overdue' ? 'calendarAlert' : 'calendar'}
              size={16}
              color={status.tone === 'overdue' ? colour.text : colour.accentText}
            />
            <Text variant="label" style={{ color: status.tone === 'overdue' ? colour.text : colour.accentText, fontWeight: '600' }}>
              {dueLine(status)}
            </Text>
          </View>
        ) : null}
        {names.map((name, index) => (
          <Text key={`${event.id}-${index}`} tone="muted">
            {name}
          </Text>
        ))}
      </Card>
    )
  }

  return (
    <Screen
      title={words.parasitesTitle}
      onBack={() => router.back()}
      action={shown ? { icon: 'plus', label: words.addTreatment, onPress: add } : undefined}
      scroll
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
          <View style={styles.gap} />
        </>
      ) : null}

      {shown ? (
        <>
          {/* Side by side would squeeze «Просрочено на 12 дней» into two
              words a line on a small phone; stacked, both stay readable. */}
          <View style={styles.cards}>
            {parasiteStatuses(t, treatments, today).map((card) => (
              <Card
                key={card.group}
                outlined
                style={styles.statusCard}
                accessibilityLabel={[card.title, card.last ? words.treatmentLast(card.last, card.product) : words.treatmentNone, card.next?.text]
                  .filter(Boolean)
                  .join(', ')}
              >
                <Text variant="h3">{card.title}</Text>
                <Text variant="label" tone="muted">
                  {card.last ? words.treatmentLast(card.last, card.product) : words.treatmentNone}
                </Text>
                {card.next ? (
                  <Text
                    variant="label"
                    style={{
                      color: card.next.tone === 'overdue' ? colour.text : card.next.tone === 'soon' ? colour.accentText : colour.muted,
                      fontWeight: card.next.tone === 'later' ? '400' : '600',
                    }}
                  >
                    {card.next.tone === 'later' ? words.coreNext(card.next.text) : card.next.text}
                  </Text>
                ) : null}
              </Card>
            ))}
          </View>

          {treatments.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="parasite" size={56} color={colour.line} />
              <Text variant="h2" center>
                {words.noTreatmentsTitle}
              </Text>
              <Text tone="muted" center>
                {words.noTreatmentsBody}
              </Text>
              <Button title={words.addTreatment} onPress={add} />
            </View>
          ) : null}

          {planned.length > 0 ? (
            <>
              <Text variant="h2" style={styles.group}>
                {words.plannedGroup}
              </Text>
              {planned.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </>
          ) : null}

          {done.length > 0 ? (
            <>
              <Text variant="h2" style={styles.group}>
                {words.doneGroup}
              </Text>
              {done.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.block },
  cards: { gap: space.row, marginBottom: space.section },
  statusCard: { padding: 16, gap: 4, marginBottom: 0 },
  empty: { alignItems: 'center', gap: space.row, marginBottom: space.section },
  group: { marginBottom: space.row },
  card: { gap: 4, padding: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})
