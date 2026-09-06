import { Link } from 'expo-router'
import { Message, Screen } from '@/ui/Screen'

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
  return (
    <Screen title="Страница не найдена">
      <Message text="Ссылка не открывается. Возможно, она устарела или потерялась по дороге." tone="info" />
      <Link href="/">На главную</Link>
    </Screen>
  )
}
