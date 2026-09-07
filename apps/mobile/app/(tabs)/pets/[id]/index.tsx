import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { PetFields } from '@/features/pets/PetFields'
import { formToInput, petToForm, type PetForm } from '@/features/pets/pet-form'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, SettingRow } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { space } from '@/ui/theme'

export default function EditPet() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [form, setForm] = useState<PetForm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const pet = await withFreshSession((api) => api.getPet(id))
      setForm(petToForm(pet))
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось загрузить питомца'))
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
      setError(errorMessage(cause, 'Не удалось сохранить изменения'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await withFreshSession((api) => api.deletePet(id))
      setAsking(false)
      router.replace('/pets')
    } catch (cause) {
      setAsking(false)
      setError(errorMessage(cause, 'Не удалось удалить питомца'))
      setBusy(false)
    }
  }

  if (!form) {
    return (
      <Screen title="Питомец" onBack={() => router.back()}>
        {error ? <Banner text={error} tone="error" /> : null}
        {error ? <LinkButton title="К списку" onPress={() => router.replace('/pets')} /> : null}
      </Screen>
    )
  }

  return (
    <Screen
      title={form.name || 'Питомец'}
      onBack={() => router.back()}
      scroll
      dock={<Button title="Сохранить" onPress={save} busy={busy} />}
    >
      <SettingRow
        title="История проверок"
        onPress={() => router.push(`/pets/${id}/checks`)}
      />
      <View style={styles.spacer} />

      <PetFields form={form} onChange={change} />

      {error ? <Banner text={error} tone="error" style={styles.error} /> : null}

      <View style={styles.gap} />
      {/* Deleting a pet takes its checks with it, so this asks rather than
          acting on a single tap. */}
      <Button
        title="Удалить питомца"
        kind="outlineDanger"
        disabled={busy}
        onPress={() => setAsking(true)}
      />
      <LinkButton title="К списку" onPress={() => router.replace('/pets')} />

      <ConfirmDialog
        visible={asking}
        title="Удалить питомца?"
        message="Вместе с ним исчезнет история его проверок. Отменить это будет нельзя."
        confirmTitle="Удалить"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  spacer: { height: space.block },
  gap: { height: space.section },
  error: { marginTop: space.block },
})
