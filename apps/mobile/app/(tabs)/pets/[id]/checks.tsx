import { router, useLocalSearchParams } from 'expo-router'
import { CheckHistory } from '@/features/checks/CheckHistory'
import { Screen } from '@/ui/Screen'

/** The same history, narrowed to one pet by the server rather than on screen. */
export default function PetChecks() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <Screen title="История" onBack={() => router.back()}>
      <CheckHistory petId={id} />
    </Screen>
  )
}
