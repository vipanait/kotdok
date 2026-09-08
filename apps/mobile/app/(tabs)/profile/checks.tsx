import { router } from 'expo-router'
import { useText } from '@/i18n'
import { CheckHistory } from '@/features/checks/CheckHistory'
import { Screen } from '@/ui/Screen'

export default function AllChecks() {
  const t = useText()
  return (
    <Screen title={t.history.title} onBack={() => router.back()}>
      <CheckHistory />
    </Screen>
  )
}
