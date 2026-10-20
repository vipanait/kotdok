import { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { Medication, MedicationDose } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useCached } from '@/lib/query-cache'
import { useText } from '@/i18n'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { colour, shadow, space } from '@/ui/theme'
import { useReminders } from './reminders/ReminderProvider'
import { todayDoses } from './reminders/doses'

const doseKey = (medicationId: string, slot: string) => `${medicationId}|${slot}`

/**
 * «Сегодня» on the pet card (FB-5/04): each dose of today with «Дали». The
 * mark shows at once and is taken back if the server refuses it; the phone
 * then drops the reminder for a dose already given.
 */
export function TodayDoses({ petId, courses }: { petId: string; courses: readonly Medication[] }) {
  const t = useText()
  const words = t.today
  const reminders = useReminders()
  const today = localToday()
  const record = useCached(['doses', petId, today], () => withFreshSession((api) => api.listDoses(petId, today, today)))
  // Marks sent but not yet answered, over what the server last said.
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [error, setError] = useState<string | null>(null)
  // One request per dose at a time: «Дали» then a quick «Отменить» could reach
  // the server in either order and leave the opposite of what was meant. The
  // ref answers a double tap before the state shows the row as busy.
  const inFlight = useRef(new Set<string>())

  const loaded = record.data ?? []
  const doses: MedicationDose[] = [
    ...loaded.filter((dose) => pending.get(doseKey(dose.medication_id, dose.slot)) !== false),
    ...[...pending]
      .filter(([key, given]) => given && !loaded.some((dose) => doseKey(dose.medication_id, dose.slot) === key))
      .map(([key]) => {
        const [medication_id, slot] = key.split('|')
        return { medication_id, taken_on: today, slot }
      }),
  ]
  const rows = todayDoses(courses, doses, new Date())
  if (rows.length === 0) return null

  async function mark(course: Medication, slot: string, given: boolean) {
    const key = doseKey(course.id, slot)
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setError(null)
    setPending((current) => new Map(current).set(key, given))
    try {
      const body = { taken_on: today, slot }
      await withFreshSession((api) => given ? api.markDose(petId, course.id, body).then(() => undefined) : api.unmarkDose(petId, course.id, body))
      await record.reload()
      reminders.refresh()
    } catch (cause) {
      setError(describeFailure(t, cause, words.failed).text)
    } finally {
      inFlight.current.delete(key)
      setPending((current) => {
        const next = new Map(current)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <Card style={styles.card}>
      <Text variant="h2" style={styles.title}>
        {words.title}
      </Text>
      {rows.map(({ course, slot, state }, index) => {
        const busy = pending.has(doseKey(course.id, slot))
        return (
          <View key={doseKey(course.id, slot)}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.row} accessible={false}>
              <Text variant="h3" style={styles.slot}>
                {slot}
              </Text>
              <View style={styles.copy}>
                <Text numberOfLines={2}>{course.name}</Text>
                {course.dosage ? (
                  <Text variant="label" tone="muted" numberOfLines={2}>
                    {course.dosage}
                  </Text>
                ) : null}
                {state === 'missed' ? (
                  <Text variant="caption" tone="danger">
                    {words.missed}
                  </Text>
                ) : null}
              </View>
              {state === 'given' ? (
                <View style={styles.given}>
                  <View style={styles.givenMark}>
                    <Icon name="check" size={18} color={colour.accentText} />
                    <Text variant="label" tone="accent">
                      {words.given}
                    </Text>
                  </View>
                  <LinkButton
                    title={words.undo}
                    align="right"
                    accessibilityLabel={`${words.undo}: ${slot}, ${course.name}`}
                    disabled={busy}
                    onPress={() => void mark(course, slot, false)}
                  />
                </View>
              ) : (
                <Button
                  title={words.give}
                  accessibilityLabel={`${words.give}: ${slot}, ${course.name}`}
                  kind="secondary"
                  disabled={busy}
                  style={styles.give}
                  onPress={() => void mark(course, slot, true)}
                />
              )}
            </View>
          </View>
        )
      })}
      {error ? <Banner text={error} tone="error" /> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 22, marginBottom: space.block, ...shadow.card },
  title: { fontSize: 25, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  slot: { width: 56 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  give: { width: 96 },
  given: { alignItems: 'flex-end' },
  givenMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colour.line },
})
