import { useRef, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { useAuth } from '@/providers/AuthProvider'
import type { ProviderId, ProviderOutcome } from '@/lib/provider-sign-in'
import { useText } from '@/i18n'
import { Text } from '@/ui/Text'
import { YANDEX_ID_SVG } from '@/ui/yandex-id'
import { TAP_TARGET, colour, font, provider, radius, type } from '@/ui/theme'
import { APPLE_MARK_ASPECT, APPLE_MARK_SVG } from '@/ui/apple-logo'
import { providerOrder } from './provider-order'

/**
 * As tall as Google's G next to it, so the three marks read as one row.
 */
const APPLE_MARK_HEIGHT = 20

/**
 * Signing in with Apple, Yandex ID or Google.
 *
 * Offered on the two screens where an account is reached — sign-in and
 * registration — and deliberately not on password recovery, where the task is
 * a password rather than a way in.
 *
 * The marks and the buttons around them belong to the providers: white ground,
 * their border, their wording, their icon at its own size, and Google's own
 * face on Google's own label. None of it is nudged towards Lapka's palette.
 * Apple's button is the one exception to "their own button": it is drawn like
 * its neighbours, by the owner's decision of 15 September 2026 — see
 * `ui/apple-logo.ts`.
 * Rules and sources: `assets/provider-sources.md` in the design concept.
 *
 * A press opens the system browser and comes back with an outcome. What the
 * user is told about that outcome is the screen's business, not the button's:
 * both screens already own a banner, and a component that renders its own
 * message would put a second one in a different place on each of them.
 *
 * While one provider is running the others are disabled. Two sign-ins racing
 * would leave whichever finished second holding a code the first already spent.
 */
export function ProviderButtons({
  onOutcome,
  canStart,
}: {
  onOutcome: (outcome: ProviderOutcome) => void
  /**
   * Asked before a provider opens; `false` stops it. Registration uses it to
   * require the consent box, which covers the providers as it covers email.
   */
  canStart?: () => boolean
}) {
  const { signInWithProvider } = useAuth()
  const t = useText()
  const [busy, setBusy] = useState<ProviderId | null>(null)
  // State updates are asynchronous, so two quick presses can both see
  // `busy === null`; two sign-ins racing would spend each other's code or
  // nonce. A ref is read synchronously and guards re-entry.
  const running = useRef(false)

  async function start(provider: ProviderId) {
    if (running.current) return
    if (canStart && !canStart()) return
    running.current = true
    setBusy(provider)
    try {
      onOutcome(await signInWithProvider(provider))
    } finally {
      running.current = false
      setBusy(null)
    }
  }

  return (
    <View>
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text variant="caption" tone="faint">
          {t.auth.dividerProviders}
        </Text>
        <View style={styles.rule} />
      </View>

      <View style={styles.buttons}>
        {providerOrder(Platform.OS).map((id) => {
          switch (id) {
            case 'apple':
              return (
                <ProviderButton
                  key={id}
                  label={t.auth.apple}
                  colours={provider.apple}
                  icon={
                    <SvgXml
                      xml={APPLE_MARK_SVG}
                      width={APPLE_MARK_HEIGHT * APPLE_MARK_ASPECT}
                      height={APPLE_MARK_HEIGHT}
                    />
                  }
                  loading={busy === 'apple'}
                  disabled={busy !== null}
                  onPress={() => start('apple')}
                />
              )
            case 'custom:yandex':
              return (
                <ProviderButton
                  key={id}
                  label={t.auth.yandex}
                  colours={provider.yandex}
                  icon={<SvgXml xml={YANDEX_ID_SVG} width={24} height={24} />}
                  loading={busy === 'custom:yandex'}
                  disabled={busy !== null}
                  onPress={() => start('custom:yandex')}
                />
              )
            case 'google':
              return (
                <ProviderButton
                  key={id}
                  label={t.auth.google}
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
                  loading={busy === 'google'}
                  disabled={busy !== null}
                  onPress={() => start('google')}
                />
              )
          }
        })}
      </View>
    </View>
  )
}

function ProviderButton({
  label,
  colours,
  icon,
  face,
  loading,
  disabled,
  onPress,
}: {
  label: string
  colours: { background: string; border: string; text: string }
  icon: React.ReactNode
  face?: string
  loading: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colours.background, borderColor: colours.border },
        { opacity: pressed || disabled ? 0.9 : 1 },
      ]}
    >
      {/* The spinner takes the mark's place, so the label does not shift. */}
      {loading ? <ActivityIndicator color={colours.text} /> : icon}
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
