import { StyleSheet, View } from 'react-native'
import { Logo } from './Logo'
import { colour } from './theme'

/**
 * The wordmark on the canvas: what the app shows before it knows anything —
 * fonts not loaded, the stored session not read.
 *
 * One component for both, so the two moments read as a single still frame
 * instead of a blank page followed by a logo with a spinner. No spinner: these
 * waits are a blink, and a spinner that appears and vanishes is the flicker.
 * Plain views only, because the fonts may not be there yet.
 */
export function BootScreen() {
  return (
    <View style={styles.frame}>
      <Logo width={150} />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colour.canvas },
})
