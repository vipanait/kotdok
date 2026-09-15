import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { SvgXml } from 'react-native-svg'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { APPLE_LOGO_ASPECT, APPLE_LOGO_SVG } from '@/ui/apple-logo'
import { provider, radius } from '@/ui/theme'

/**
 * Sign in with Apple, drawn the way Apple requires rather than the way the
 * other buttons are.
 *
 * On iOS it is the system button: an appearance Apple has already approved,
 * a title the system translates, and a label VoiceOver reads. White with an
 * outline, because the screen is light and its neighbours are white too.
 *
 * Android has no system button, so this one keeps the system button's rules:
 * white ground, black logo and title, Apple's own logo file at the button's
 * inner height (inside the 1pt border), and a title 43% of the button's
 * height. That makes the title larger than Google's and Yandex's. It is
 * Apple's proportion, not a slip.
 *
 * The iOS button cannot show a spinner and must not be restyled, so while it is
 * busy the group around it shows one — see ProviderButtons.
 */

/**
 * Apple requires its button to be no smaller than the other sign-in buttons.
 * The tallest neighbour is Yandex: 24 icon + 2×10 padding + 2 border = 46.
 */
const APPLE_BUTTON_HEIGHT = 46

export function AppleButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  // The iOS system button draws and translates its own title; `label` is
  // used only by the custom (Android) button below.
  label: string
  loading: boolean
  disabled: boolean
  onPress: () => void
}) {
  if (Platform.OS === 'ios') {
    return (
      <View pointerEvents={disabled ? 'none' : 'auto'} accessibilityState={{ disabled, busy: loading }}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={APPLE_BUTTON_HEIGHT / 2}
          style={styles.system}
          onPress={onPress}
        />
      </View>
    )
  }

  // The custom button has a 1pt border inside its height, so the logo (and
  // the spinner slot that replaces it) is drawn at the inner height —
  // otherwise Apple's logo file, which carries its own opaque white rect,
  // paints over the border.
  const logoHeight = APPLE_BUTTON_HEIGHT - 2
  const logoWidth = logoHeight * APPLE_LOGO_ASPECT

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.custom, { opacity: pressed || disabled ? 0.9 : 1 }]}
    >
      {/* The spinner takes the logo's place, so the title does not shift. */}
      {loading ? (
        <View style={[styles.logoSlot, { width: logoWidth, height: logoHeight }]}>
          <ActivityIndicator color={provider.apple.text} />
        </View>
      ) : (
        <SvgXml xml={APPLE_LOGO_SVG} width={logoWidth} height={logoHeight} />
      )}
      <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  system: { width: '100%', height: APPLE_BUTTON_HEIGHT },
  custom: {
    height: APPLE_BUTTON_HEIGHT,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Apple: at least 8% of the width between the title and the trailing edge.
    paddingRight: '8%',
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: provider.apple.background,
    borderColor: provider.apple.border,
  },
  logoSlot: { alignItems: 'center', justifyContent: 'center' },
  // Apple: the title is 43% of the button's height, whatever the font.
  title: { fontSize: Math.round(APPLE_BUTTON_HEIGHT * 0.43), color: provider.apple.text, fontWeight: '500' },
})
