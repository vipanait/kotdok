import { useState } from 'react'
import { Button } from 'react-native'
import { Link, router } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { PetFields } from '@/features/pets/PetFields'
import { emptyPetForm, formToInput, type PetForm } from '@/features/pets/pet-form'
import { Message, Screen } from '@/ui/Screen'

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
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить питомца')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Новый питомец" scroll>
      <PetFields form={form} onChange={change} />
      {error ? <Message text={error} /> : null}
      <Button title={busy ? 'Сохраняем…' : 'Сохранить'} onPress={submit} disabled={busy} />
      <Link href="/pets">Отмена</Link>
    </Screen>
  )
}
