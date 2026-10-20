import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { localToday } from './calendar-day'

/**
 * The phone's calendar day, kept current: a screen left open past midnight
 * moves to the new day when the app comes back to the front, or at the
 * minute it turns while on screen.
 */
export function useToday(): string {
  const [today, setToday] = useState(localToday)
  useEffect(() => {
    const check = () => setToday(localToday())
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check()
    })
    const timer = setInterval(check, 60_000)
    return () => {
      subscription.remove()
      clearInterval(timer)
    }
  }, [])
  return today
}
