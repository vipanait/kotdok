import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IconButton } from './Button'
import { Text } from './Text'
import type { IconName } from './Icon'
import { colour, space } from './theme'

export type ScreenAction = { icon: IconName; label: string; onPress: () => void }

/**
 * How wide the content column is allowed to get.
 *
 * The concept is drawn at 390 points and every measurement in it — the 20 pt
 * gutter, the 52 pt controls, the line length — assumes a phone held in one
 * hand. Left unbounded on a tablet the same layout puts a name field across a
 * forearm of glass. The column stops here and centres instead.
 */
const COLUMN_MAX_WIDTH = 480

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
    <View style={[styles.header, styles.column]}>
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
            contentContainerStyle={[styles.body, styles.column, centered ? styles.centered : null]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.body, styles.column, centered ? styles.centered : null]}>
            {children}
          </View>
        )}
        {dock ? (
          <View style={styles.dockBar}>
            <View style={[styles.dock, styles.column]}>{dock}</View>
          </View>
        ) : null}
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
    // The concept puts 12 here, measured against a drawn status bar. A real
    // iPhone's island is taller than the drawing, so the same 12 reads as the
    // title crowding it.
    paddingTop: 24,
    paddingBottom: space.block,
  },
  // The arrow's 44 pt target overhangs the gutter so the glyph inside it, and
  // not the box around it, lines up with the text below.
  back: { marginLeft: -12 },
  title: { flex: 1 },
  body: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  // Header, content and dock share one column so they stay in line with each
  // other on a screen wider than the phone the design was drawn for.
  column: { width: '100%', maxWidth: COLUMN_MAX_WIDTH, alignSelf: 'center' },
  centered: { flexGrow: 1, justifyContent: 'center' },
  dockBar: { backgroundColor: colour.canvas },
  dock: {
    paddingHorizontal: space.gutter,
    paddingVertical: 12,
  },
})
