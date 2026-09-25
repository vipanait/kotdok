import { useCallback, useState } from 'react'
import { AppState, Linking, StyleSheet, Switch, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useText } from '@/i18n'
import { useReminders, reminderStore } from '@/features/medical-record/reminders/ReminderProvider'
import { askPermission, permissionState, type PermissionState } from '@/features/medical-record/reminders/notifications'
import { REMINDER_HOURS, type ReminderSettings } from '@/features/medical-record/reminders/schedule'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Select } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * «Напоминания» (spec §7.20, M23–M25): this phone's choices. Blocked in the
 * system, the switch is off and inactive, with the way to Settings.
 */
export default function RemindersSettings() {
  const t = useText()
  const words = t.reminders
  const reminders = useReminders()
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  const [permission, setPermission] = useState<PermissionState | null>(null)

  useFocusEffect(
    useCallback(() => {
      const read = () =>
        void Promise.all([reminderStore.settings(), permissionState()]).then(([stored, state]) => {
          setSettings(stored)
          setPermission(state)
        })
      read()
      // Back from the phone's Settings the system's answer may have changed:
      // the app returns to the front, the screen never lost focus.
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') read()
      })
      return () => subscription.remove()
    }, []),
  )

  async function change(next: ReminderSettings) {
    setSettings(next)
    await reminderStore.saveSettings(next).catch(() => {})
    reminders.refresh()
  }

  async function toggle(on: boolean) {
    if (!settings) return
    if (on && permission === 'undetermined') {
      const state = await askPermission().catch(() => 'denied' as const)
      setPermission(state)
      if (state !== 'granted') return
    }
    await change({ ...settings, enabled: on })
  }

  const blocked = permission === 'denied'
  const on = Boolean(settings?.enabled) && permission === 'granted'

  return (
    <Screen title={words.title} onBack={() => router.back()} scroll>
      {blocked ? (
        <View style={styles.blocked}>
          <Banner text={words.blocked} tone="error" icon="alert" />
          <Button title={words.openSettings} kind="secondary" onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.fill}>{words.toggle}</Text>
        <Switch
          accessibilityLabel={words.toggle}
          value={on}
          disabled={blocked || !settings}
          onValueChange={(value) => void toggle(value)}
          trackColor={{ true: colour.accent, false: colour.line }}
        />
      </View>

      {settings ? (
        <>
          <Select
            label={words.when}
            allowNone={false}
            options={([1, 3, 7] as const).map((days) => ({ value: String(days), label: words.whenOptions[days] }))}
            value={String(settings.daysBefore)}
            onChange={(value) => value && void change({ ...settings, daysBefore: Number(value) as 1 | 3 | 7 })}
          />
          <Select
            label={words.time}
            allowNone={false}
            options={REMINDER_HOURS.map((hour) => ({ value: String(hour), label: words.hour(hour) }))}
            value={String(settings.hour)}
            onChange={(value) => value && void change({ ...settings, hour: Number(value) })}
          />
        </>
      ) : null}

      <Text variant="label" tone="muted" style={styles.caption}>
        {words.thisPhone}
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  blocked: { gap: space.row, marginBottom: space.section },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.row, marginBottom: space.section },
  fill: { flex: 1 },
  caption: { marginTop: space.row },
})
