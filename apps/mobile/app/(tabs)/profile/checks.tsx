import { router } from 'expo-router'
import { CheckHistory } from '@/features/checks/CheckHistory'
import { Screen } from '@/ui/Screen'

export default function AllChecks() {
  return (
    <Screen title="История" onBack={() => router.back()}>
      <CheckHistory />
    </Screen>
  )
}
