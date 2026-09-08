import { Image, Pressable, StyleSheet, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { Text } from '@/ui/Text'
import { YANDEX_ID_SVG } from '@/ui/yandex-id'
import { TAP_TARGET, colour, font, provider, radius, type } from '@/ui/theme'

/**
 * Signing in with Yandex ID or Google.
 *
 * Offered on the two screens where an account is reached — sign-in and
 * registration — and deliberately not on password recovery, where the task is
 * a password rather than a way in.
 *
 * The marks and the buttons around them belong to the providers: white ground,
 * their border, their wording, their icon at its own size, and Google's own
 * face on Google's own label. None of it is nudged towards Lapka's palette.
 * Rules and sources: `assets/provider-sources.md` in the design concept.
 *
 * The presses do nothing yet. The whole exchange — system browser, PKCE, the
 * return to the app, and the rule against merging accounts on a matching email
 * — is stage 5 of `docs/mobile-api-plan.md`, and the staging project has no
 * provider enabled to talk to (open question 1.14). Wiring a button to a
 * failure would teach people the app is broken rather than unfinished.
 */
export function ProviderButtons() {
  return (
    <View>
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text variant="caption" tone="faint">
          или войти с помощью
        </Text>
        <View style={styles.rule} />
      </View>

      <View style={styles.buttons}>
        <ProviderButton
          label="Войти с Яндекс ID"
          colours={provider.yandex}
          icon={<SvgXml xml={YANDEX_ID_SVG} width={24} height={24} />}
        />
        <ProviderButton
          label="Продолжить с Google"
          colours={provider.google}
          face={font.google}
          icon={
            <Image
              source={require('../../../assets/art/google-g.png')}
              style={styles.googleMark}
              resizeMode="contain"
              accessible={false}
            />
          }
        />
      </View>
    </View>
  )
}

function ProviderButton({
  label,
  colours,
  icon,
  face,
}: {
  label: string
  colours: { background: string; border: string; text: string }
  icon: React.ReactNode
  face?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Not wired yet, and saying so beats a button that swallows a tap.
      accessibilityState={{ disabled: true }}
      onPress={() => {}}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colours.background, borderColor: colours.border },
        { opacity: pressed ? 0.9 : 1 },
      ]}
    >
      {icon}
      <Text style={[type.provider, { color: colours.text }, face ? { fontFamily: face } : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colour.line },
  buttons: { gap: 8 },
  button: {
    minHeight: TAP_TARGET,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  googleMark: { width: 20, height: 20 },
})
