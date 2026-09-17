import { Stack } from 'expo-router'
import { colour } from '@/ui/theme'

/**
 * One stack per tab, so pushing a pet or a result keeps the tab bar and the
 * back arrow. Leaving the tab returns it to its first screen: see the tabs layout.
 */
export default function TabStack() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colour.canvas } }}
    />
  )
}
