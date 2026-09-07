import { useCallback, useState } from 'react'
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { ExtraCheckRequestStatus, PublicProfile } from '@lapka/contracts'
import { SUPPORTED_LOCALES } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { checksWord } from '@/features/profile/plural'
import { Choice } from '@/ui/Form'
import { Message, Screen } from '@/ui/Screen'

const localeLabels = { ru: 'Русский', en: 'English' } as const

const extraStatusText: Record<string, string> = {
  pending: 'Запрос отправлен, ждём ответа',
  approved: 'Запрос одобрен — проверка начислена',
  rejected: 'В этот раз отказали',
}

export default function Profile() {
  const { signOut } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [extra, setExtra] = useState<ExtraCheckRequestStatus | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [me, request] = await Promise.all([
        withFreshSession((api) => api.getMe()),
        withFreshSession((api) => api.getExtraCheckRequest()),
      ])
      setProfile(me)
      setExtra(request)
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
    setBusy(true)
    setError(null)
    try {
      setProfile(await withFreshSession((api) => api.updateMe({ locale })))
      setNotice('Язык сохранён. Ответы анализа придут на нём.')
    } catch {
      setError('Не удалось сменить язык')
    } finally {
      setBusy(false)
    }
  }

  async function askForExtra() {
    setBusy(true)
    setError(null)
    try {
      setExtra(await withFreshSession((api) => api.requestExtraCheck()))
      setNotice('Запрос отправлен. Ответ придёт в приложение.')
    } catch {
      setError('Не удалось отправить запрос')
    } finally {
      setBusy(false)
    }
  }

  if (!profile) {
    return (
      <Screen title="Профиль">
        {error ? <Message text={error} /> : <ActivityIndicator />}
      </Screen>
    )
  }

  return (
    <Screen title="Профиль" scroll>
      <View style={styles.balance}>
        <Text style={styles.count}>{profile.credits}</Text>
        <Text style={styles.countWord}>{checksWord(profile.credits)} осталось</Text>
      </View>

      {profile.capabilities.extra_check_request ? (
        <View style={styles.block}>
          {extra?.status ? (
            <Message text={extraStatusText[extra.status] ?? extra.status} tone="info" />
          ) : (
            <Button
              title="Попросить ещё одну проверку"
              onPress={() => void askForExtra()}
              disabled={busy}
            />
          )}
        </View>
      ) : null}

      <Choice
        label="Язык"
        clearable={false}
        options={SUPPORTED_LOCALES.map((value) => ({ value, label: localeLabels[value] }))}
        value={profile.locale}
        onChange={(locale) => locale && void changeLocale(locale)}
      />

      {notice ? <Message text={notice} tone="info" /> : null}
      {error ? <Message text={error} /> : null}

      <Button title="История проверок" onPress={() => router.push('/checks')} />
      <Button title="К питомцам" onPress={() => router.push('/pets')} />
      <Button title="Выйти" onPress={() => void signOut()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  balance: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  count: { fontSize: 40, fontWeight: '600' },
  countWord: { color: '#555' },
  block: { gap: 8, marginTop: 8 },
})
