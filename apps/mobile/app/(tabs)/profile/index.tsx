import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import Constants from 'expo-constants'
import type { PublicProfile } from '@lapka/contracts'
import { SUPPORTED_LOCALES } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { checksWord } from '@/lib/plural'
import { Button } from '@/ui/Button'
import { Banner, SettingRow } from '@/ui/Card'
import { OptionSheet } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, radius, shadow, space } from '@/ui/theme'

const localeLabels = { ru: 'Русский', en: 'English' } as const

export default function Profile() {
  const { signOut } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickingLocale, setPickingLocale] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setProfile(await withFreshSession((api) => api.getMe()))
    } catch {
      setError('Не удалось загрузить профиль')
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function changeLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
    setError(null)
    try {
      setProfile(await withFreshSession((api) => api.updateMe({ locale })))
      setNotice('Язык сохранён. Ответы анализа придут на нём.')
    } catch {
      setError('Не удалось сменить язык')
    }
  }

  if (!profile) {
    return (
      <Screen title="Профиль">
        {error ? <Banner text={error} tone="error" /> : <ActivityIndicator color={colour.accent} />}
      </Screen>
    )
  }

  const empty = profile.credits === 0

  return (
    <Screen
      title="Профиль"
      scroll
      dock={
        <>
          <Button title="Выйти" kind="secondary" onPress={() => void signOut()} />
          <Text variant="caption" tone="faint" center style={styles.version}>
            Версия {Constants.expoConfig?.version ?? '—'}
          </Text>
        </>
      }
    >
      <View style={[styles.balance, empty ? styles.balanceEmpty : shadow.card]}>
        <Text variant="balance" tone={empty ? 'muted' : 'accent'} style={styles.count}>
          {profile.credits}
        </Text>
        <Text tone="muted">{checksWord(profile.credits)} осталось</Text>
        {empty && profile.capabilities.extra_check_request ? (
          <Button
            title="Запросить дополнительную проверку"
            onPress={() => router.push('/profile/extra-check')}
            style={styles.balanceAction}
          />
        ) : null}
      </View>

      {notice ? <Banner text={notice} /> : null}
      {error ? <Banner text={error} tone="error" /> : null}

      <SettingRow
        icon="globe"
        title="Язык"
        value={localeLabels[profile.locale]}
        onPress={() => setPickingLocale(true)}
      />
      <SettingRow
        icon="history"
        title="История проверок"
        onPress={() => router.push('/profile/checks')}
      />

      <OptionSheet
        visible={pickingLocale}
        title="Язык"
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
