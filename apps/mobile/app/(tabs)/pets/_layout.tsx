import { Stack } from 'expo-router'
import { stackOptions } from '@/ui/stack'

/**
 * One stack per tab, so pushing a pet or a result keeps the tab bar and the
 * back arrow. Leaving the tab returns it to its first screen: see the tabs layout.
 */
/**
 * A link that opens a screen deep in this tab (a reminder, `lapka://…`) puts
 * the pet list under it, so back has somewhere to go on a cold start too.
 */
export const unstable_settings = { initialRouteName: 'index' }

export default function TabStack() {
  return (
    <Stack screenOptions={stackOptions} />
  )
}
