import { useState } from 'react'
import { router } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { PetFields } from '@/features/pets/PetFields'
import { emptyPetForm, formToInput, type PetForm } from '@/features/pets/pet-form'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'

export default function NewPet() {
  const [form, setForm] = useState<PetForm>(emptyPetForm())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function change(patch: Partial<PetForm>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  async function submit() {
    const input = formToInput(form)
    if (!input.ok) {
      setError(input.message)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const pet = await withFreshSession((api) => api.createPet(input.value))
      // Straight to the new pet rather than back to the list: the person just
      // described it, and this is where they check it came out right.
      router.replace(`/pets/${pet.id}`)
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось сохранить питомца'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Новый питомец"
      onBack={() => router.back()}
      scroll
      dock={
        <>
          <Button title="Сохранить" onPress={submit} busy={busy} />
          <LinkButton title="Отмена" onPress={() => router.back()} />
        </>
      }
    >
      <PetFields form={form} onChange={change} />
      {error ? <Banner text={error} tone="error" /> : null}
    </Screen>
  )
}
