import { Stack } from 'expo-router'
import { stackOptions } from '@/ui/stack'

/**
 * «Можно ли?»: the search, and the cards it opens on top. A link deep into
 * the tab still has the search under it to go back to.
 */
export const unstable_settings = { initialRouteName: 'index' }

export default function SafetyStack() {
  return <Stack screenOptions={stackOptions} />
}
