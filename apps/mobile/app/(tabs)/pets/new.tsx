import { useState } from 'react'
import { router } from 'expo-router'
import { withFreshSession } from '@/lib/api'
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
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'

export default function NewPet() {
  const t = useText()
  const [form, setForm] = useState<PetForm>(emptyPetForm())
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<FieldError | null>(null)
  const [busy, setBusy] = useState(false)
  const unsaved = useUnsavedChanges(petFormChanged(emptyPetForm(), form))

  function change(patch: Partial<PetForm>) {
    setForm((current) => ({ ...current, ...patch }))
    setInvalid((current) => remainingError(current, patch))
  }

  /**
   * @param then where to go once saved. By default the new pet, which is where
   * the person checks it came out right; from the leave question, wherever they
   * were headed.
   */
  async function submit(then?: () => void) {
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
      const pet = await withFreshSession((api) => api.createPet(input.value))
      unsaved.leave(then ?? (() => router.replace(`/pets/${pet.id}`)))
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
      dock={
        <>
          <Button title={t.common.save} onPress={() => void submit()} busy={busy} />
          <LinkButton title={t.common.cancel} onPress={() => router.back()} />
        </>
      }
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
