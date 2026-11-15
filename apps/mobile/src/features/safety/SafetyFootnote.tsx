import { useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { TAP_TARGET, colour, space } from '@/ui/theme'

/**
 * The one line under a «Можно ли» screen (pet-safety-v1 handoff §8):
 * «Справочная информация. Не заменяет консультацию ветеринара.» and
 * «О материалах», which opens the full explanation — who prepared the texts,
 * that no vet reviewed them, where the sources are, how an AI answer is
 * marked — in a sheet, instead of repeating it under every section.
 *
 * The sheet takes the screen reader's focus on its title when it opens,
 * closes with its button, the backdrop, Android's back and the VoiceOver
 * escape gesture, and clears the home indicator (all but the first come with
 * `Sheet`). Long text at the largest font scrolls inside it.
 */
export function SafetyFootnote({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useText().safety.about
  return (
    <View style={[styles.line, style]}>
      <Text variant="caption" tone="faint" style={styles.caption}>
        {t.caption}
      </Text>
      <SafetyAboutLink label={t.action} />
    </View>
  )
}

/**
 * A text action that opens the «О материалах» sheet: «О материалах» in the
 * footnote, «Как подготовлен материал» on a card's sources (handoff §8).
 */
export function SafetyAboutLink({ label }: { label: string }) {
  const t = useText().safety.about
  const [open, setOpen] = useState(false)
  const title = useRef<View>(null)
  const { height } = useWindowDimensions()

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text variant="label" tone="accent" maxFontSizeMultiplier={CONTROL_FONT_LIMIT} style={styles.actionText}>
          {label}
        </Text>
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        onShow={() => {
          if (title.current) AccessibilityInfo.sendAccessibilityEvent(title.current, 'focus')
        }}
      >
        <View ref={title} accessible accessibilityRole="header" accessibilityLabel={t.title} style={styles.title}>
          <Text variant="h2">{t.title}</Text>
        </View>
        <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={styles.body}>
          {t.paragraphs.map((paragraph) => (
            <Text key={paragraph} tone="muted">
              {paragraph}
            </Text>
          ))}
        </ScrollView>
        <Button title={t.close} kind="secondary" onPress={() => setOpen(false)} style={styles.close} />
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  // Under a rule, as the design closes every screen.
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    marginTop: space.section,
    paddingTop: space.row,
    borderTopWidth: 1,
    borderTopColor: colour.line,
  },
  caption: { flexShrink: 1 },
  // As tall and as wide as a fingertip, though the words are caption-sized.
  action: { minHeight: TAP_TARGET, minWidth: TAP_TARGET, justifyContent: 'center', alignSelf: 'flex-start' },
  actionText: { textDecorationLine: 'underline', color: colour.accentText },
  title: { marginBottom: space.row },
  body: { gap: space.row },
  close: { marginTop: space.block },
})
