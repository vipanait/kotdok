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
  const [open, setOpen] = useState(false)
  const title = useRef<View>(null)
  const { height } = useWindowDimensions()

  return (
    <View style={[styles.line, style]}>
      <Text variant="caption" tone="faint" style={styles.caption}>
        {t.caption}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.action}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text variant="label" tone="accent" maxFontSizeMultiplier={CONTROL_FONT_LIMIT} style={styles.actionText}>
          {t.action}
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
    </View>
  )
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  caption: { flexShrink: 1 },
  // As tall and as wide as a fingertip, though the words are caption-sized.
  action: { minHeight: TAP_TARGET, minWidth: TAP_TARGET, justifyContent: 'center' },
  actionText: { textDecorationLine: 'underline', color: colour.accentText },
  title: { marginBottom: space.row },
  body: { gap: space.row },
  close: { marginTop: space.block },
})
