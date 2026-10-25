import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { BackHandler } from 'react-native'
import { useFocusEffect } from 'expo-router'

/**
 * Moving between the check's two steps: which side the step now on screen
 * came in from (`from`, null when it simply appeared), and Android's back on
 * the second step returning to the first, like the arrow, instead of leaving
 * the tab.
 */
export function useCheckSteps(step: 1 | 2, setStep: Dispatch<SetStateAction<1 | 2>>) {
  const enteredFrom = useRef<'left' | 'right' | null>(null)
  function goTo(next: 1 | 2) {
    enteredFrom.current = next === 2 ? 'right' : 'left'
    setStep(next)
  }

  useFocusEffect(
    useCallback(() => {
      if (step !== 2) return
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        goTo(1)
        return true
      })
      return () => subscription.remove()
      // goTo touches only the ref and the setter, which never change.
    }, [step]),
  )

  return { from: enteredFrom.current, goTo }
}
