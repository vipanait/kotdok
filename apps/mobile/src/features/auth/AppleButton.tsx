import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { SvgXml } from 'react-native-svg'
import { Text } from '@/ui/Text'
import { APPLE_LOGO_ASPECT, APPLE_LOGO_SVG } from '@/ui/apple-logo'
import { TAP_TARGET, provider, radius } from '@/ui/theme'

/**
 * Sign in with Apple, drawn the way Apple requires rather than the way the
 * other buttons are.
 *
 * On iOS it is the system button: an appearance Apple has already approved,
 * a title the system translates, and a label VoiceOver reads. White with an
 * outline, because the screen is light and its neighbours are white too.
 *
 * Android has no system button, so this one keeps the system button's rules:
 * white ground, black logo and title, Apple's own logo file at the full height
 * of the button, and a title 43% of that height. That makes the title larger
 * than Google's and Yandex's. It is Apple's proportion, not a slip.
 *
 * The iOS button cannot show a spinner and must not be restyled, so while it is
 * busy the group around it shows one — see ProviderButtons.
 */
export function AppleButton({
  label,
  loading,
  disabled,
  onPress,
}: {
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
          cornerRadius={TAP_TARGET / 2}
          style={styles.system}
          onPress={onPress}
        />
      </View>
    )
  }

  const logoWidth = TAP_TARGET * APPLE_LOGO_ASPECT

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
        <View style={[styles.logoSlot, { width: logoWidth }]}>
          <ActivityIndicator color={provider.apple.text} />
        </View>
      ) : (
        <SvgXml xml={APPLE_LOGO_SVG} width={logoWidth} height={TAP_TARGET} />
      )}
      <Text style={styles.title}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  system: { width: '100%', height: TAP_TARGET },
  custom: {
    height: TAP_TARGET,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Apple: at least 8% of the width between the title and the trailing edge.
    paddingRight: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: provider.apple.background,
    borderColor: provider.apple.border,
  },
  logoSlot: { height: TAP_TARGET, alignItems: 'center', justifyContent: 'center' },
  // Apple: the title is 43% of the button's height, whatever the font.
  title: { fontSize: Math.round(TAP_TARGET * 0.43), color: provider.apple.text, fontWeight: '500' },
})
