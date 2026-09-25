import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { reminderMoment } from './schedule'
import type { Notifier } from './sync'

const CHANNEL = 'reminders'

// A reminder that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export type PermissionState = 'granted' | 'undetermined' | 'denied'

/** Denied means the system will not ask again: only Settings can change it. */
export async function permissionState(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted'
  return current.canAskAgain ? 'undetermined' : 'denied'
}

/** Android 8+ files notifications under a channel the person can mute in Settings. */
export async function prepareChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL, { name, importance: Notifications.AndroidImportance.DEFAULT })
}

export async function askPermission(): Promise<PermissionState> {
  await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
  return permissionState()
}

/**
 * Local notifications only — no push token, no server (spec, «Уведомления»).
 * On iOS the trigger is a calendar date and hour, which the system keeps on
 * the wall clock if the phone changes time zone before it fires; Android has
 * no such trigger, so it gets the moment, recomputed on each app open.
 */
export const notifier: Notifier = {
  granted: async () => (await permissionState()) === 'granted',
  cancelAll: () => Notifications.cancelAllScheduledNotificationsAsync(),
  async schedule(reminder, data) {
    const [year, month, day] = reminder.day.split('-').map(Number)
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: { title: reminder.title, body: reminder.body, data },
      trigger:
        Platform.OS === 'ios'
          ? { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, year, month, day, hour: reminder.hour, minute: 0, repeats: false }
          : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderMoment(reminder.day, reminder.hour), channelId: CHANNEL },
    })
  },
}
