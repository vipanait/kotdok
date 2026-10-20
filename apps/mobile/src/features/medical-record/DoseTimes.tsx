import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { MEDICATION_TIMES_MAX, type Medication } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import { Banner } from '@/ui/Card'
import { Chips, Field } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { CONTROL_HEIGHT, colour, radius, space } from '@/ui/theme'
import { useReminders } from './reminders/ReminderProvider'
import { addTime, editTime, readTime, toggleTime } from './dose-times'

const PRESETS = ['08:00', '12:00', '20:00']

/**
 * When a course is given (FB-5): chips for the usual times and one of the
 * owner's own, saved at once. The phone reminds at them while the course
 * runs; the app suggests neither the time nor the dose.
 *
 * «Своё время» (design 20 October 2026): the field and its «+» side by side,
 * one height; an error goes under the row and leaves the button where it is.
 * What was typed stays until the server has taken it.
 */
export function DoseTimes({ petId, course, onChanged }: { petId: string; course: Medication; onChanged: (course: Medication) => void }) {
  const t = useText()
  const words = t.doseTimes
  const reminders = useReminders()
  const [custom, setCustom] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A second tap before the state says busy is the same tap.
  const sending = useRef(false)
  const times = course.reminder_times

  async function save(next: string[]): Promise<boolean> {
    if (sending.current) return false
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      onChanged(await withFreshSession((api) => api.setMedicationTimes(petId, course.id, next)))
      // A time added is the moment to ask whether to notify; one taken off only reschedules.
      if (next.length > times.length) reminders.timesSaved(course.name)
      else reminders.refresh()
      return true
    } catch (cause) {
      setError(describeFailure(t, cause, words.failed).text)
      return false
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  async function addCustom() {
    const time = readTime(custom)
    if (!time) {
      setInvalid(true)
      return
    }
    // Already there: nothing to send, and nothing left to type.
    if (times.includes(time)) {
      setCustom('')
      return
    }
    const sent = custom
    // Cleared only if nothing was typed while it was being saved.
    if (await save(addTime(times, time))) setCustom((current) => (current === sent ? '' : current))
  }

  const options = [...new Set([...PRESETS, ...times])].sort().map((time) => ({ value: time, label: time }))
  const full = times.length >= MEDICATION_TIMES_MAX
  const canAdd = !busy && custom.trim() !== ''

  return (
    <View style={styles.block}>
      <Chips
        label={words.title}
        options={options}
        values={times}
        onToggle={(time) => {
          // A fifth time is refused here, not sent: the chip simply stays off.
          if (busy || (full && !times.includes(time))) return
          void save(toggleTime(times, time))
        }}
      />
      {!full ? (
        <>
          <Text variant="label" tone="muted" style={styles.customLabel}>
            {words.custom}
          </Text>
          <View style={styles.customRow}>
            <Field
              label={words.custom}
              labelHidden
              value={custom}
              onChangeText={(text) => {
                setInvalid(false)
                setCustom((previous) => editTime(previous, text))
              }}
              placeholder="07:30"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              error={invalid ? words.invalid : null}
              style={styles.customField}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={words.addLabel}
              accessibilityState={{ disabled: !canAdd, busy }}
              disabled={!canAdd}
              onPress={() => void addCustom()}
              style={({ pressed }) => [styles.add, !canAdd && !busy ? styles.addOff : null, { opacity: pressed ? 0.7 : 1 }]}
            >
              {busy ? <ActivityIndicator color={colour.accent} /> : <Icon name="plus" color={canAdd ? colour.accentText : colour.faint} />}
            </Pressable>
          </View>
        </>
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
  customLabel: { marginBottom: 6 },
  // Top-aligned: an error under the field grows the field's column, not the button's.
  customRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.row },
  customField: { flex: 1 },
  add: {
    width: CONTROL_HEIGHT,
    height: CONTROL_HEIGHT,
    borderRadius: radius.field,
    backgroundColor: colour.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addOff: { backgroundColor: colour.soft },
})
