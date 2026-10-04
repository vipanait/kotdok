import { Stack } from 'expo-router'
import { stackOptions } from '@/ui/stack'

/**
 * One stack per tab, so pushing a pet or a result keeps the tab bar and the
 * back arrow. Leaving the tab returns it to its first screen: see the tabs layout.
 */
export default function TabStack() {
  return (
    <Stack screenOptions={stackOptions} />
  )
}
