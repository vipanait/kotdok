import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour } from '@/ui/theme'

/**
 * The consent text itself. Always the production site, whichever API this
 * build talks to, for the same reason as the terms in LegalNote.
 */
export const CONSENT_URL = 'https://lapka.my/legal/personal-data'

/**
 * The one box to tick: consent to personal data processing, unticked until the
 * person ticks it. The link opens the text; the rest of the row toggles.
 */
export function ConsentCheckbox({
  checked,
  onChange,
  invalid,
  style,
}: {
  checked: boolean
  onChange(value: boolean): void
  /** Set when the person tried to go on without ticking it. */
  invalid: boolean
  style?: StyleProp<ViewStyle>
}) {
  const t = useText()

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${t.consent.checkboxPrefix} ${t.consent.checkboxLink}`}
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.boxOn, invalid && !checked && styles.boxInvalid]}>
          {checked ? <Icon name="tick" size={16} color={colour.surface} /> : null}
        </View>
        <Text variant="caption" tone="muted" style={styles.label}>
          {t.consent.checkboxPrefix}{' '}
          <Text
            variant="caption"
            tone="accent"
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(CONSENT_URL)}
            style={styles.link}
          >
            {t.consent.checkboxLink}
          </Text>
        </Text>
      </Pressable>
      {invalid ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {t.consent.errorRequired}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: TAP_TARGET, gap: 12 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colour.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colour.accent, borderColor: colour.accent },
  boxInvalid: { borderColor: colour.danger },
  label: { flex: 1 },
  link: { textDecorationLine: 'underline' },
})
