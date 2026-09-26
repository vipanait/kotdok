import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import type { WeightMeasurement } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { dayInput, localToday, parseDayInput } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { Button, IconButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'
import { parseWeight, weightPatch } from './weight'

/**
 * Adding a weighing, or correcting one (M20).
 *
 * `editing` null is a new weighing for today; otherwise that measurement,
 * with a way to delete it. The sheet closes only when the server has the
 * change: a failed save keeps what was typed and says why.
 */
export function WeightSheet({
  petId,
  visible,
  editing,
  onClose,
  onSaved,
}: {
  petId: string
  visible: boolean
  editing: WeightMeasurement | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useText()
  const words = t.medicalRecord
  const [weight, setWeight] = useState('')
  const [day, setDay] = useState('')
  const [invalid, setInvalid] = useState<{ weight?: string; day?: string }>({})
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  // Fresh values each time the sheet opens, not whatever the last one left.
  useEffect(() => {
    if (!visible) return
    setWeight(editing ? t.decimal(editing.weight_kg) : '')
    // An undated weight from the form opens with an empty day, not today's.
    setDay(editing ? (editing.measured_on ? dayInput(editing.measured_on) : '') : dayInput(localToday()))
    setInvalid({})
    setError(null)
    setAsking(false)
  }, [visible, editing, t])

  async function save() {
    const parsedWeight = parseWeight(weight)
    // Only the undated weight may stay without a day.
    const dayOptional = editing !== null && editing.measured_on === null && day.trim() === ''
    const parsedDay = dayOptional ? null : parseDayInput(day)
    setInvalid({
      weight: parsedWeight.ok ? undefined : words.weightInvalid,
      day: parsedDay || dayOptional ? undefined : words.dateInvalid,
    })
    if (!parsedWeight.ok || (!parsedDay && !dayOptional)) return

    const patch = editing ? weightPatch(editing, parsedWeight.value, parsedDay) : null
    if (editing && !patch) {
      onClose()
      return
    }

    setBusy(true)
    setError(null)
    try {
      await withFreshSession((api) =>
        editing && patch
          ? api.changeWeight(petId, editing.id, patch)
          : api.addWeight(petId, { measured_on: parsedDay!, weight_kg: parsedWeight.value }),
      )
      onSaved()
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'conflict') {
        setInvalid({ day: words.dayTaken })
      } else {
        setError(describeFailure(t, cause, words.saveWeightFailed))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      await withFreshSession((api) => api.deleteWeight(petId, editing.id))
      onSaved()
    } catch (cause) {
      setError(describeFailure(t, cause, words.deleteWeightFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
          <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
            <View style={styles.handle} />
            {asking ? (
              // The question is asked inside the sheet, not in a dialog of its
              // own: a modal opened from a modal and closed together with it
              // left an invisible layer on iOS that swallowed every tap.
              <>
                <Text variant="h2" style={styles.questionTitle}>
                  {words.deleteWeightTitle}
                </Text>
                <Text tone="muted" style={styles.question}>
                  {words.deleteWeightBody}
                </Text>
                {error ? (
                  <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.error} />
                ) : null}
                <Button title={t.pets.removeConfirm} kind="danger" busy={busy} onPress={() => void remove()} />
                <View style={styles.delete}>
                  <Button title={t.common.cancel} kind="secondary" disabled={busy} onPress={() => setAsking(false)} />
                </View>
              </>
            ) : (
              <>
                <View style={styles.head}>
                  <Text variant="h2" style={styles.title}>
                    {editing ? words.editWeight : words.addWeight}
                  </Text>
                  <IconButton icon="close" label={t.common.cancel} onPress={onClose} />
                </View>

                <Field
                  label={words.weightField}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  error={invalid.weight}
                />
                <Field
                  label={words.dateField}
                  value={day}
                  onChangeText={setDay}
                  placeholder={words.datePlaceholder}
                  keyboardType="numbers-and-punctuation"
                  error={invalid.day}
                />

                {error ? (
                  <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.error} />
                ) : null}

                <Button title={t.common.save} onPress={() => void save()} busy={busy} />
                {editing ? (
                  <View style={styles.delete}>
                    <Button
                      title={words.deleteWeight}
                      kind="outlineDanger"
                      disabled={busy}
                      onPress={() => {
                        setError(null)
                        setAsking(true)
                      }}
                    />
                  </View>
                ) : null}
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,21,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colour.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colour.line,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: space.row,
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: space.row },
  title: { flex: 1 },
  questionTitle: { marginBottom: space.row },
  question: { marginBottom: space.block },
  error: { marginBottom: space.block },
  delete: { marginTop: space.row },
})
