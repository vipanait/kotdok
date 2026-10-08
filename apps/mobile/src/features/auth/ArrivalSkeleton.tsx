import { useText } from '@/i18n'
import { Screen } from '@/ui/Screen'
import { ListSkeleton } from '@/ui/Skeleton'

/**
 * The pet list's shape, for the moments between being let in and the list
 * itself: a provider's answer being exchanged for a session, the consent of a
 * fresh sign-in being settled.
 *
 * Those moments used to show the sign-in form again and then a blank page.
 * The list is where nearly everyone ends up, so its outline is the honest
 * thing to draw; the few who still owe a consent go from here to that screen.
 */
export function ArrivalSkeleton() {
  const t = useText()
  return (
    <Screen title={t.pets.title}>
      <ListSkeleton rows={3} avatar />
    </Screen>
  )
}
