import { Redirect, router } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { Intro } from '@/features/onboarding/Intro'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Screen } from '@/ui/Screen'

/**
 * The first launch's intro. «Войти» replaces it with sign-in rather than
 * stacking on top: once read, there is nothing to go back to, and the
 * first-launch marker already keeps the next launch from showing it.
 */
export default function IntroScreen() {
  const { session } = useAuth()
  const t = useText()

  // A session arriving underneath (an email link, say) makes this screen moot.
  if (session) return <Redirect href="/pets" />

  return (
    <Screen scroll dock={<Button title={t.intro.signIn} onPress={() => router.replace('/sign-in')} />}>
      <Intro />
    </Screen>
  )
}
