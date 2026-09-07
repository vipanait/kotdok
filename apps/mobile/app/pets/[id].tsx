import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Button } from 'react-native'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { PetFields } from '@/features/pets/PetFields'
import { formToInput, petToForm, type PetForm } from '@/features/pets/pet-form'
import { Message, Screen } from '@/ui/Screen'

export default function EditPet() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [form, setForm] = useState<PetForm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const pet = await withFreshSession((api) => api.getPet(id))
      setForm(petToForm(pet))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить питомца')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  function change(patch: Partial<PetForm>) {
    setForm((current) => (current ? { ...current, ...patch } : current))
  }

  async function save() {
    if (!form) return

    const input = formToInput(form)
    if (!input.ok) {
      setError(input.message)
      return
    }

    setBusy(true)
    setError(null)
    try {
      await withFreshSession((api) => api.updatePet(id, input.value))
      router.replace('/pets')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения')
    } finally {
      setBusy(false)
    }
  }

  function confirmRemove() {
    // Deleting a pet takes its checks with it, so this asks rather than acting
    // on a single tap.
    Alert.alert(
      'Удалить питомца?',
      'Вместе с ним исчезнет история его проверок. Отменить это будет нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => void remove() },
      ],
    )
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await withFreshSession((api) => api.deletePet(id))
      router.replace('/pets')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить питомца')
      setBusy(false)
    }
  }

  if (!form) {
    return (
      <Screen title="Питомец">
        {error ? <Message text={error} /> : <ActivityIndicator />}
        {error ? <Link href="/pets">К списку</Link> : null}
      </Screen>
    )
  }

  return (
    <Screen title={form.name || 'Питомец'} scroll>
      <PetFields form={form} onChange={change} />
      {error ? <Message text={error} /> : null}
      <Button title={busy ? 'Сохраняем…' : 'Сохранить'} onPress={save} disabled={busy} />
      <Button title="Удалить питомца" color="#b3261e" onPress={confirmRemove} disabled={busy} />
      <Link href="/pets">К списку</Link>
    </Screen>
  )
}
