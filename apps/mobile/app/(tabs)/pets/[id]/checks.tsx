import { router, useLocalSearchParams } from 'expo-router'
import { useText } from '@/i18n'
import { CheckHistory } from '@/features/checks/CheckHistory'
import { Screen } from '@/ui/Screen'

/** The same history, narrowed to one pet by the server rather than on screen. */
export default function PetChecks() {
  const t = useText()
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <Screen title={t.history.title} onBack={() => router.back()}>
      <CheckHistory petId={id} />
    </Screen>
  )
}
