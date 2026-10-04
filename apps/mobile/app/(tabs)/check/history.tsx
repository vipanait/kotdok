import { router } from 'expo-router'
import { useText } from '@/i18n'
import { CheckHistory } from '@/features/checks/CheckHistory'
import { Screen } from '@/ui/Screen'

/**
 * The history, opened from a check whose answer is taking too long.
 *
 * The profile has the same list, but sending the person there switched tabs and
 * back led to the profile; here back returns to the check tab, and a result
 * opens in it.
 */
export default function CheckTabHistory() {
  const t = useText()
  return (
    <Screen title={t.history.title} onBack={() => router.back()}>
      <CheckHistory resultHref={(checkId) => `/check/${checkId}`} />
    </Screen>
  )
}
