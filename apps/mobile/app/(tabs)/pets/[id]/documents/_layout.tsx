import { Stack } from 'expo-router'
import { stackOptions } from '@/ui/stack'

/**
 * The documents as a stack of their own, with the list at its bottom: a
 * screen opened straight into it (`router.push(…, { withAnchor: true })`
 * from «Что добавить?», or a link to one document) has the list under it,
 * so «← Документы» and back after a save both lead there. One push, not
 * two in the same tick while the sheet is closing.
 */
export const unstable_settings = { initialRouteName: 'index' }

export default function DocumentsStack() {
  return <Stack screenOptions={stackOptions} />
}
