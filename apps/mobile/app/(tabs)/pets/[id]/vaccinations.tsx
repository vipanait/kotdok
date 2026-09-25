import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthEvent, HealthOverview } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { coreStatuses, dueLine, dueStatus, itemName } from '@/features/medical-record/due'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * The vaccinations (M5, M13): where each core vaccination stands, then the
 * plans and the records. Empty is not blank — the core block still says what
 * is usually done, and the form's own answer is shown if it has one.
 */
export default function Vaccinations() {
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
  const vaccinations = (shown?.events ?? []).filter((event) => event.kind === 'vaccination')
  const planned = vaccinations.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))
  const done = vaccinations.filter((e) => e.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
  const add = () => router.push(`/pets/${id}/event-form?mode=new&status=done`)

  function EventCard({ event }: { event: HealthEvent }) {
    const status = event.status === 'planned' ? dueStatus(t, event.date, today) : null
    const names = event.items.map((item) => itemName(t, item))
    return (
      <Card
        outlined
        onPress={() => router.push(`/pets/${id}/event/${event.id}`)}
        accessibilityLabel={[t.day(event.date, true), status && status.tone !== 'later' ? dueLine(status) : null, ...names, event.clinic]
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
        {event.clinic ? (
          <Text variant="caption" tone="faint">
            {event.clinic}
          </Text>
        ) : null}
      </Card>
    )
  }

  return (
    <Screen
      title={words.vaccinationsTitle}
      onBack={() => router.back()}
      action={shown ? { icon: 'plus', label: words.addVaccination, onPress: add } : undefined}
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
          {vaccinations.length === 0 && shown.pet.vaccinated === true ? (
            <Banner text={words.vaccinatedInFormBanner} tone="info" style={styles.banner} />
          ) : null}

          <Card outlined style={styles.core}>
            <Text variant="h3" style={styles.coreTitle}>
              {words.coreTitle[shown.pet.species]}
            </Text>
            {coreStatuses(t, shown.pet.species, vaccinations, today).map((core, index) => (
              <View
                key={core.target}
                style={[styles.coreRow, index > 0 ? styles.divider : null]}
                accessible
                accessibilityLabel={`${core.title}, ${core.text}`}
              >
                <Text variant="bodyStrong">{core.title}</Text>
                <Text
                  variant="label"
                  tone={core.tone === 'none' || core.tone === 'later' ? 'muted' : undefined}
                  style={
                    core.tone === 'overdue'
                      ? { color: colour.text, fontWeight: '600' }
                      : core.tone === 'soon'
                        ? { color: colour.accentText, fontWeight: '600' }
                        : undefined
                  }
                >
                  {core.text}
                </Text>
              </View>
            ))}
          </Card>
          <Text variant="caption" tone="faint" style={styles.note}>
            {words.coreNote[shown.pet.species]}
          </Text>

          {vaccinations.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="vaccine" size={56} color={colour.line} />
              <Text variant="h2" center>
                {words.noVaccinationsTitle}
              </Text>
              <Text tone="muted" center>
                {words.noVaccinationsBody}
              </Text>
              <Button title={words.addVaccination} onPress={add} />
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
  banner: { marginBottom: space.block },
  core: { padding: 16 },
  coreTitle: { marginBottom: 4 },
  coreRow: { paddingVertical: 10, gap: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line },
  note: { marginTop: 4, marginBottom: space.section },
  empty: { alignItems: 'center', gap: space.row, marginBottom: space.section },
  group: { marginBottom: space.row },
  card: { gap: 4, padding: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})
