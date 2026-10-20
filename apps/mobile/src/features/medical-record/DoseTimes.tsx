import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { MEDICATION_TIMES_MAX, type Medication } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Chips, Field } from '@/ui/Field'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'
import { useReminders } from './reminders/ReminderProvider'
import { addTime, readTime, toggleTime } from './dose-times'

const PRESETS = ['08:00', '12:00', '20:00']

/**
 * When a course is given (FB-5): chips for the usual times and one of the
 * owner's own, saved at once. The phone reminds at them while the course
 * runs; the app suggests neither the time nor the dose.
 */
export function DoseTimes({ petId, course, onChanged }: { petId: string; course: Medication; onChanged: (course: Medication) => void }) {
  const t = useText()
  const words = t.doseTimes
  const reminders = useReminders()
  const [custom, setCustom] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const times = course.reminder_times

  async function save(next: string[]) {
    setBusy(true)
    setError(null)
    try {
      onChanged(await withFreshSession((api) => api.setMedicationTimes(petId, course.id, next)))
      // A time added is the moment to ask whether to notify; one taken off only reschedules.
      if (next.length > times.length) reminders.timesSaved(course.name)
      else reminders.refresh()
    } catch (cause) {
      setError(describeFailure(t, cause, words.failed).text)
    } finally {
      setBusy(false)
    }
  }

  const options = [...new Set([...PRESETS, ...times])].sort().map((time) => ({ value: time, label: time }))
  const full = times.length >= MEDICATION_TIMES_MAX

  return (
    <View style={styles.block}>
      <Chips label={words.title} options={options} values={times} onToggle={(time) => !busy && void save(toggleTime(times, time))} />
      {!full ? (
        <View style={styles.custom}>
          <Field
            label={words.custom}
            value={custom}
            onChangeText={(text) => {
              setInvalid(false)
              setCustom(text)
            }}
            placeholder="07:30"
            keyboardType="numbers-and-punctuation"
            error={invalid ? words.invalid : null}
            style={styles.customField}
          />
          <LinkButton
            title={words.add}
            align="left"
            disabled={busy || custom.trim() === ''}
            onPress={() => {
              const time = readTime(custom)
              if (!time) return setInvalid(true)
              setCustom('')
              void save(addTime(times, time))
            }}
          />
        </View>
      ) : null}
      <Text variant="caption" tone="muted">
        {words.note}
      </Text>
      {error ? <Banner text={error} tone="error" /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: space.block, marginBottom: space.block },
  custom: { flexDirection: 'row', alignItems: 'flex-end', gap: space.row },
  customField: { flex: 1 },
})
