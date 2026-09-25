import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import type { PublicProfile } from '@lapka/contracts'
import { SUPPORTED_LOCALES } from '@lapka/shared'
import { runningUpdate } from '@/features/updates/update-state'
import { reminderStore } from '@/features/medical-record/reminders/ReminderProvider'
import { permissionState } from '@/features/medical-record/reminders/notifications'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useAuth } from '@/providers/AuthProvider'
import { dictionary, useLocale, useSetLocale, useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Banner, SettingRow } from '@/ui/Card'
import { OptionSheet } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, radius, shadow, space } from '@/ui/theme'

/** Long enough to read the sentence twice, short enough not to become part of the page. */
const NOTICE_VISIBLE_MS = 5000

/** A language names itself in itself, whatever the interface is set to. */
const localeLabels = { ru: 'Русский', en: 'English' } as const

export default function Profile() {
  const t = useText()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const { currentlyRunning } = Updates.useUpdates()
  const update = runningUpdate(currentlyRunning)
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

  const [remindersOn, setRemindersOn] = useState<boolean | null>(null)

  useFocusEffect(
    useCallback(() => {
      // «Вкл» only when both this phone's setting and the system allow it.
      void Promise.all([reminderStore.settings(), permissionState()])
        .then(([settings, permission]) => setRemindersOn(settings.enabled && permission === 'granted'))
        .catch(() => setRemindersOn(null))
      void load()
      // A confirmation belongs to the moment it confirms. Coming back to the
      // profile later, it would announce a change nobody just made.
      return () => setNotice(null)
    }, [load]),
  )

  /**
   * The confirmation goes away on its own.
   *
   * It stayed for as long as the tab lived — a quarter of an hour in testing —
   * and pushed the settings below it down for all of that time.
   */
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [notice])

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
          {/* So a tester can see that a published update has arrived. */}
          {update ? (
            <Text variant="caption" tone="faint" center>
              {t.profile.update(
                update.createdAt.toLocaleString(locale, {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                update.id,
              )}
            </Text>
          ) : null}
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
        icon="bell"
        title={t.reminders.title}
        value={remindersOn === null ? undefined : remindersOn ? t.reminders.on : t.reminders.off}
        onPress={() => router.push('/profile/reminders')}
      />
      <SettingRow
        icon="history"
        title={t.profile.history}
        onPress={() => router.push('/profile/checks')}
      />
      {/* Findable rather than buried: 9/01 asks for a visible entry, and a
          deletion nobody can find is a deletion the stores will fail us for. */}
      <SettingRow
        icon="logout"
        title={t.deletion.entry}
        onPress={() => router.push('/profile/delete-account')}
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
