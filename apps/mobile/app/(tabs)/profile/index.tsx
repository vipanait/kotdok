import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import Constants from 'expo-constants'
import type { PublicProfile } from '@lapka/contracts'
import { SUPPORTED_LOCALES } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useAuth } from '@/providers/AuthProvider'
import { dictionary, useSetLocale, useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Banner, SettingRow } from '@/ui/Card'
import { OptionSheet } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, radius, shadow, space } from '@/ui/theme'

/** A language names itself in itself, whatever the interface is set to. */
const localeLabels = { ru: 'Русский', en: 'English' } as const

export default function Profile() {
  const t = useText()
  const setLocale = useSetLocale()
  const { signOut } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [pickingLocale, setPickingLocale] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const me = await withFreshSession((api) => api.getMe())
      setProfile(me)
      // The account's own choice governs the interface from here on.
      setLocale(me.locale)
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.loadProfileFailed))
    }
  }, [t, setLocale])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function changeLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
    setError(null)
    try {
      setProfile(await withFreshSession((api) => api.updateMe({ locale })))
      setLocale(locale)
      setNotice(dictionary(locale).profile.localeSaved)
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.changeLocaleFailed))
    }
  }

  if (!profile) {
    return (
      <Screen title={t.profile.title}>
        {error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            {/* Without this the screen is a dead end: the reload happens on
                focus, and the tab is already focused. */}
            <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
          </>
        ) : (
          <ActivityIndicator color={colour.accent} />
        )}
      </Screen>
    )
  }

  const empty = profile.credits === 0

  return (
    <Screen
      title={t.profile.title}
      scroll
      dock={
        <>
          <Button title={t.profile.signOut} kind="secondary" onPress={() => void signOut()} />
          <Text variant="caption" tone="faint" center style={styles.version}>
            {t.profile.version(Constants.expoConfig?.version ?? '—')}
          </Text>
        </>
      }
    >
      <View style={[styles.balance, empty ? styles.balanceEmpty : shadow.card]}>
        <Text variant="balance" tone={empty ? 'muted' : 'accent'} style={styles.count}>
          {profile.credits}
        </Text>
        <Text tone="muted">{t.profile.checksLeft(profile.credits)}</Text>
        {empty && profile.capabilities.extra_check_request ? (
          <Button
            title={t.profile.extraRequest}
            onPress={() => router.push('/profile/extra-check')}
            style={styles.balanceAction}
          />
        ) : null}
      </View>

      {notice ? <Banner text={notice} /> : null}
      {error ? (
        <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
      ) : null}

      <SettingRow
        icon="globe"
        title={t.profile.language}
        value={localeLabels[profile.locale]}
        onPress={() => setPickingLocale(true)}
      />
      <SettingRow
        icon="history"
        title={t.profile.history}
        onPress={() => router.push('/profile/checks')}
      />

      <OptionSheet
        visible={pickingLocale}
        title={t.profile.language}
        allowNone={false}
        options={SUPPORTED_LOCALES.map((value) => ({ value, label: localeLabels[value] }))}
        value={profile.locale}
        onChange={(locale) => locale && void changeLocale(locale)}
        onClose={() => setPickingLocale(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  balance: {
    backgroundColor: colour.surface,
    borderRadius: radius.card,
    padding: 24,
    marginBottom: space.section,
  },
  balanceEmpty: { backgroundColor: colour.soft },
  count: { marginBottom: 4 },
  balanceAction: { marginTop: space.block },
  version: { marginTop: 16 },
})
