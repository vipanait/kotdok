import { useCallback, useEffect, useState } from 'react'
import { useNavigation } from 'expo-router'
import { usePreventRemove } from 'expo-router/react-navigation'
import { setTabGuard } from './tab-guard'

/**
 * Asks before a screen with unsaved changes is left.
 *
 * Covers every way out: the back arrow, the swipe, and another tab. What the
 * person was doing is kept as `pending` while they decide, and carried out by
 * `leave` — which is also how the screen itself leaves after saving, because
 * until the guard is lifted its own navigation would be stopped too.
 */
export function useUnsavedChanges(changed: boolean) {
  const navigation = useNavigation()
  const [released, setReleased] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [then, setThen] = useState<(() => void) | null>(null)
  const guarding = changed && !released

  usePreventRemove(guarding, ({ data }) => {
    setPending(() => () => navigation.dispatch(data.action))
  })

  useEffect(() => {
    if (!guarding) return
    return setTabGuard((proceed) => setPending(() => proceed))
  }, [guarding])

  // After the render that lifted the guard, not in the same tick: the stack
  // learns about the lifted guard from an effect, and would stop an action sent
  // before it.
  useEffect(() => {
    if (!released || !then) return
    setThen(null)
    then()
  }, [released, then])

  /** Lifts the guard and goes. */
  const leave = useCallback((next: () => void) => {
    setPending(null)
    setReleased(true)
    setThen(() => next)
  }, [])

  /** Closes the question and stays. */
  const stay = useCallback(() => setPending(null), [])

  return { pending, leave, stay }
}
