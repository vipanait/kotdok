import { Stack } from 'expo-router'
import { colour } from '@/ui/theme'

/**
 * One stack per tab, so pushing a pet or a result keeps the tab bar and the
 * back arrow, and switching tabs does not throw away where you were.
 */
export default function TabStack() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colour.canvas } }}
    />
  )
}
