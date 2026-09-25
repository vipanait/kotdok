import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import { useReminders } from '@/features/medical-record/reminders/ReminderProvider'
import { PetFields } from '@/features/pets/PetFields'
import {
  formToInput,
  petFormChanged,
  petToForm,
  remainingError,
  type FieldError,
  type PetForm,
} from '@/features/pets/pet-form'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { ConfirmDialog, SaveChangesDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { colour, space } from '@/ui/theme'

/** The pet form, as it was before the medical record: opened by «Анкета». */
export default function EditPet() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const reminders = useReminders()
  const [form, setForm] = useState<PetForm | null>(null)
  const [hasWeights, setHasWeights] = useState(false)
  const [hasCourses, setHasCourses] = useState(false)
  // What the server holds, to tell an edit from a form that was only looked at.
  const [saved, setSaved] = useState<PetForm | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [invalid, setInvalid] = useState<FieldError | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      // The record, not just the pet: the form points to the weight history
      // when there is one.
      const { pet, weights, medications } = await withFreshSession((api) => api.getHealthOverview(id))
      setForm(petToForm(pet))
      setSaved(petToForm(pet))
      setHasWeights(weights.length > 0)
      setHasCourses(medications.some((course) => course.source === 'record' || course.dosage !== null))
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.loadPetFailed))
    }
  }, [id, t])

  useEffect(() => {
    void load()
  }, [load])

  const unsaved = useUnsavedChanges(
    form !== null && saved !== null && petFormChanged(saved, form),
  )

  function change(patch: Partial<PetForm>) {
    setForm((current) => (current ? { ...current, ...patch } : current))
    setInvalid((current) => remainingError(current, patch))
  }

  /**
   * @param then where to go once saved: back to the medical record the form was
   * opened from, or wherever the person was headed.
   */
  async function save(then: () => void = () => router.back()) {
    if (!form) return

    const input = formToInput(t, form)
    if (!input.ok) {
      setInvalid({ field: input.field, message: input.message })
      setError(null)
      return
    }

    setInvalid(null)
    setBusy(true)
    setError(null)
    try {
      // The owner's own day: a weight saved from the form is that day's measurement.
      await withFreshSession((api) =>
        api.updatePet(id, { ...input.value, weight_measured_on: localToday() }),
      )
      // The name in a reminder, and the «vaccinated» plan, may have changed.
      reminders.refresh()
      unsaved.leave(then)
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.saveChangesFailed))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await withFreshSession((api) => api.deletePet(id))
      reminders.refresh()
      setAsking(false)
      // Past the medical record too: it belonged to the pet that is now gone.
      unsaved.leave(() => router.dismissTo('/pets'))
    } catch (cause) {
      setAsking(false)
      setError(describeFailure(t, cause, t.errors.removePetFailed))
      setBusy(false)
    }
  }

  if (!form) {
    return (
      <Screen title={t.pets.fallbackTitle} onBack={() => router.back()}>
        {error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
            <LinkButton title={t.common.toList} onPress={() => router.dismissTo('/pets')} />
          </>
        ) : (
          // Until this arrives the screen has nothing but a title, and a blank
          // page reads as a broken one rather than as a slow one.
          <ActivityIndicator color={colour.accent} />
        )}
      </Screen>
    )
  }

  return (
    <Screen
      title={t.medicalRecord.form}
      onBack={() => router.back()}
      scroll
      dock={<Button title={t.common.save} onPress={() => void save()} busy={busy} />}
    >
      <PetFields
        form={form}
        onChange={change}
        invalid={invalid}
        notes={{
          weight: hasWeights ? t.medicalRecord.weightHistoryHint : undefined,
          medications: hasCourses ? t.medicalRecord.meds.formHint : undefined,
        }}
      />

      {error ? (
        <Banner
          text={error.text}
          tone="error"
          icon={error.offline ? 'wifi' : 'alert'}
          style={styles.error}
        />
      ) : null}

      <View style={styles.gap} />
      {/* Deleting a pet takes its checks with it, so this asks rather than
          acting on a single tap. */}
      <Button
        title={t.pets.remove}
        kind="outlineDanger"
        disabled={busy}
        onPress={() => setAsking(true)}
      />

      <ConfirmDialog
        visible={asking}
        title={t.pets.removeTitle}
        message={t.pets.removeBody}
        confirmTitle={t.pets.removeConfirm}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />

      <SaveChangesDialog
        visible={unsaved.pending !== null}
        busy={busy}
        onSave={() => {
          const next = unsaved.pending
          unsaved.stay()
          if (next) void save(next)
        }}
        onDiscard={() => unsaved.pending && unsaved.leave(unsaved.pending)}
        onStay={unsaved.stay}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.section },
  error: { marginTop: space.block },
})
