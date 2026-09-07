import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IconButton } from './Button'
import { Text } from './Text'
import type { IconName } from './Icon'
import { colour, space } from './theme'

export type ScreenAction = { icon: IconName; label: string; onPress: () => void }

/**
 * The frame every screen sits in: cream ground, one gutter, one title.
 *
 * `dock` is the concept's fixed footer — the main action stays reachable while
 * a long form scrolls under it. The pet form has sixteen fields, and a Save
 * button at the bottom of that is a Save button nobody finds.
 */
export function Screen({
  title,
  onBack,
  action,
  children,
  dock,
  scroll = false,
  centered = false,
}: {
  title?: string
  onBack?: () => void
  action?: ScreenAction
  children: ReactNode
  dock?: ReactNode
  scroll?: boolean
  centered?: boolean
}) {
  const heading = title ? (
    <View style={styles.header}>
      {onBack ? (
        <IconButton icon="back" label="Назад" onPress={onBack} style={styles.back} />
      ) : null}
      <Text variant="h1" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {action ? (
        <IconButton icon={action.icon} label={action.label} onPress={action.onPress} soft />
      ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    paddingBottom: space.block,
  },
  // The arrow's 44 pt target overhangs the gutter so the glyph inside it, and
  // not the box around it, lines up with the text below.
  back: { marginLeft: -12 },
  title: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  centered: { flexGrow: 1, justifyContent: 'center' },
  dock: {
    paddingHorizontal: space.gutter,
    paddingVertical: 12,
    backgroundColor: colour.canvas,
  },
})
