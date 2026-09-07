import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text } from './Text'
import { colour, space } from './theme'

/**
 * The frame every screen sits in: cream ground, one gutter, one title.
 *
 * `dock` is the concept's fixed footer — the main action stays reachable while
 * a long form scrolls under it. The pet form has sixteen fields, and a Save
 * button at the bottom of that is a Save button nobody finds.
 */
export function Screen({
  title,
  children,
  dock,
  scroll = false,
  centered = false,
}: {
  title?: string
  children: ReactNode
  dock?: ReactNode
  scroll?: boolean
  centered?: boolean
}) {
  const heading = title ? (
    <View style={styles.header}>
      <Text variant="h1">{title}</Text>
    </View>
  ) : null

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {heading}
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.body, centered ? styles.centered : null]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.body, centered ? styles.centered : null]}>
            {children}
          </View>
        )}
        {dock ? <View style={styles.dock}>{dock}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colour.canvas },
  fill: { flex: 1 },
  header: { paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: space.block },
  body: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  centered: { flexGrow: 1, justifyContent: 'center' },
  dock: {
    paddingHorizontal: space.gutter,
    paddingVertical: 12,
    backgroundColor: colour.canvas,
  },
})
