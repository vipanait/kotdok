import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useText } from '@/i18n'
import { IconButton } from './Button'
import { CONTROL_FONT_LIMIT, Text } from './Text'
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
  const t = useText()
  const [dockHeight, setDockHeight] = useState(0)

  const heading = title ? (
    <View style={[styles.header, styles.column]}>
      {onBack ? (
        <IconButton icon="back" label={t.common.back} onPress={onBack} style={styles.back} />
      ) : null}
      {/* Two lines and a ceiling. One line turned "Проверка симптомов" into
          "Пров…" at the largest accessibility size; no ceiling turned it into
          two lines of ninety points that pushed the screen's actual content
          off the bottom. The title names the screen — what the reader came
          for is below it, and scales without limit. */}
      <Text
        variant="h1"
        style={styles.title}
        numberOfLines={2}
        maxFontSizeMultiplier={CONTROL_FONT_LIMIT}
      >
        {title}
      </Text>
      {action ? (
        <IconButton icon={action.icon} label={action.label} onPress={action.onPress} soft />
      ) : null}
    </View>
  ) : null

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {heading}
      {/*
        The dock floats over the scroller instead of standing under it.

        Standing under it, the dock's keyboard padding stole that height from
        the scroller above: the scroller's bottom edge stopped short of the
        keyboard, so React Native saw no overlap and never brought the focused
        field into view. Measured on an iPhone 13 with Notes focused — field
        off-screen, dock sitting where it should have been, unchanged by moving
        the scroller out of the dock's KeyboardAvoidingView.

        Floating, the scroller reaches the keyboard and scrolls the field into
        view itself; the padding below keeps that field clear of the dock rather
        than under it. The height is measured, not assumed: a dock with one
        button is shorter than one with two.
      */}
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[
            styles.body,
            styles.column,
            centered ? styles.centered : null,
            { paddingBottom: styles.body.paddingBottom + dockHeight },
          ]}
          keyboardShouldPersistTaps="handled"
          // `interactive`, not `on-drag`: the field worth scrolling to is the
          // one being typed into, and `on-drag` shut the keyboard the moment
          // anyone reached for it.
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.body, styles.column, centered ? styles.centered : null]}>
          {children}
        </View>
      )}
      {/*
        `padding` on both platforms, not just iOS. Android was left to
        `adjustResize`, which is the usual advice and was wrong here: the app
        draws behind the system bars, so the window never shrinks and the dock
        stayed put. Measured on a tablet: Save sat at y=2485 with the keyboard's
        top edge at y≈1962, unmoved whether the keyboard was up or down.
      */}
      {dock ? (
        <KeyboardAvoidingView behavior="padding" style={styles.dockLayer}>
          <View
            style={styles.dockBar}
            onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
          >
            <View style={[styles.dock, styles.column]}>{dock}</View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
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
  // The dock floats over the scroller's last inches; the scroller pads itself
  // by the measured height so nothing ends up underneath it.
  dockLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  dockBar: { backgroundColor: colour.canvas },
  dock: {
    paddingHorizontal: space.gutter,
    paddingVertical: 12,
  },
})
