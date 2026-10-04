import { View } from 'react-native'
import { colour } from '@/ui/theme'

/** The canvas, and nothing else, for the moment an email link is handled. */
export function LinkPending() {
  return <View style={{ flex: 1, backgroundColor: colour.canvas }} />
}
