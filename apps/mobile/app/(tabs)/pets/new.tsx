import { useEffect, useState } from 'react'
import { router, useLocalSearchParams, useSegments } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { useRecordChanged } from '@/features/medical-record/record-cache'
import { localToday } from '@/lib/calendar-day'
import { errorMessage } from '@/lib/errors'
import { useText } from '@/i18n'
import { PetFields } from '@/features/pets/PetFields'
import {
  emptyPetForm,
  formToInput,
  petFormChanged,
  remainingError,
  type FieldError,
  type PetForm,
} from '@/features/pets/pet-form'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { onboardingStore } from '@/features/onboarding/store'
import { useAuth } from '@/providers/AuthProvider'

export default function NewPet() {
  const t = useText()
  const recordChanged = useRecordChanged()
  // Also mounted in the check tab (check/new-pet), where saving returns to the check.
  const tab = (useSegments() as string[])[1]
  // Onboarding: the path this form was opened on, if any (`check` or `health`).
  const { goal } = useLocalSearchParams<{ goal?: string }>()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  // Left with back, the path is over too: nothing to resume at the next start.
  // A form the system closes with the app keeps it, and opens again.
  useEffect(
    () => () => {
      if (goal && userId) void onboardingStore.finish(userId).catch(() => undefined)
    },
    [goal, userId],
  )
  const [form, setForm] = useState<PetForm>(emptyPetForm())
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<FieldError | null>(null)
  const [busy, setBusy] = useState(false)
  const changed = petFormChanged(emptyPetForm(), form)
  const unsaved = useUnsavedChanges(changed)

  function change(patch: Partial<PetForm>) {
    setForm((current) => ({ ...current, ...patch }))
    setInvalid((current) => remainingError(current, patch))
  }

  /**
   * @param then where to go once saved. By default the new pet's first steps
   * (vaccinations and the last vet visit, FB-2/03), then the pet itself; from
   * the leave question, wherever they were headed.
   */
  async function submit(then?: () => void) {
    const input = formToInput(t, form, localToday())
    if (!input.ok) {
      setInvalid({ field: input.field, message: input.message })
      setError(null)
      return
    }

    setInvalid(null)
    setBusy(true)
    setError(null)
    try {
      const pet = await withFreshSession((api) =>
        api.createPet({ ...input.value, weight_measured_on: localToday() }),
      )
      // The lists have one pet more.
      void recordChanged(null)
      // From the check tab, on to the check the pet was added for, with this
      // pet chosen — also when the form was opened from onboarding, where
      // there was no check under it to go back to.
      // Onboarding's health path offers the first record instead of the first
      // steps' questions — one or the other, never both.
      const next = tab === 'check' ? () => router.dismissTo({ pathname: '/check', params: { petId: pet.id } }) : goal === 'health' ? () => router.replace(`/pets/${pet.id}/first-record`) : () => router.replace(`/pets/${pet.id}/first-steps`)
      // The pet is saved: the path it was begun on has nothing left to resume.
      if (goal && userId) void onboardingStore.finish(userId).catch(() => undefined)
      unsaved.leave(then ?? next)
    } catch (cause) {
      setError(errorMessage(t, cause, t.errors.savePetFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title={t.pets.newTitle}
      onBack={() => router.back()}
      scroll
      // No «Отмена»: back is the way out, and it asks about what was typed.
      dock={<Button title={t.common.save} onPress={() => void submit()} busy={busy} />}
    >
      <PetFields form={form} onChange={change} invalid={invalid} />
      {error ? <Banner text={error} tone="error" /> : null}

      <SaveChangesDialog
        visible={unsaved.pending !== null}
        busy={busy}
        onSave={() => {
          const next = unsaved.pending
          unsaved.stay()
          if (next) void submit(next)
        }}
        onDiscard={() => unsaved.pending && unsaved.leave(unsaved.pending)}
        onStay={unsaved.stay}
      />
    </Screen>
  )
}
