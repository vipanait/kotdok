import { router } from 'expo-router'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'

/**
 * Where a link that matches no route ends up.
 *
 * Without this file expo-router falls back to its own "Unmatched Route" screen,
 * which is written for developers and prints the URL back at the reader. A
 * person following a confirmation link that was mangled in transit — truncated
 * by a mail client, cut in half by a messenger — would see that.
 *
 * The URL is deliberately not shown: it is attacker-controlled text, and there
 * is nothing a person can do with it anyway.
 */
export default function NotFound() {
  const t = useText()
  return (
    <Screen title={t.notFound.title}>
      <Banner text={t.notFound.body} />
      <Button title={t.notFound.home} onPress={() => router.replace('/')} />
    </Screen>
  )
}
