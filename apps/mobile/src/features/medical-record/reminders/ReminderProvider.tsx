import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState, Linking, Modal, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import type { DueItem } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { deviceStorage } from '@/lib/supabase'
import { useText } from '@/i18n'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/ui/Button'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'
import { createReminderStore, shouldAsk } from './device-store'
import { askPermission, notifier, permissionState, prepareChannel } from './notifications'
import { reminderAbout } from './schedule'
import { createReminderSync, openTarget } from './sync'

export const reminderStore = createReminderStore(deviceStorage)

type Reminders = {
  /** After any change to plans or settings: reschedules this phone. */
  refresh(): void
  /**
   * After a plan was saved (spec §7.19): reschedules, and the first time asks
   * whether to remind — our sheet, then the system's question.
   */
  planSaved(plan: Pick<DueItem, 'kind' | 'name' | 'targets'>): void
}

const RemindersContext = createContext<Reminders | null>(null)

export function useReminders(): Reminders {
  const value = useContext(RemindersContext)
  if (!value) throw new Error('useReminders used outside ReminderProvider')
  return value
}

/**
 * Keeps the phone's reminders in step with the signed-in owner's plans: on
 * sign-in, whenever the app comes back to the front, after a record is saved.
 * Sign-out cancels them all. A tapped reminder opens the pet's medical record
 * once someone is signed in — at cold start that is after the session loads.
 */
export function ReminderProvider({ children }: { children: ReactNode }) {
  const t = useText()
  const { session, loading } = useAuth()
  const userId = session?.user.id ?? null
  const words = t.reminders
  const tRef = useRef(t)
  tRef.current = t

  const sync = useMemo(
    () => createReminderSync({ notifier, settings: () => reminderStore.settings(), t: () => tRef.current }),
    [],
  )

  const refresh = useCallback(() => {
    if (!userId) return
    void sync
      .run({
        userId,
        load: () =>
          withFreshSession(async (api) => {
            const [due, pets] = await Promise.all([api.listDue(), api.listPets()])
            return { due, pets: pets.map((pet) => ({ id: pet.id, name: pet.name })) }
          }),
      })
      .catch(() => {})
  }, [sync, userId])

  useEffect(() => {
    void prepareChannel(words.title).catch(() => {})
  }, [words.title])

  useEffect(() => {
    if (loading) return
    if (!userId) {
      void sync.clear().catch(() => {})
      return
    }
    refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => subscription.remove()
  }, [loading, userId, refresh, sync])

  // A tap on a reminder, including the one that launched the app.
  const response = Notifications.useLastNotificationResponse()
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!response || loading || !userId) return
    const key = `${response.notification.request.identifier}|${response.notification.date}`
    if (handled.current === key) return
    handled.current = key
    const data = response.notification.request.content.data
    void withFreshSession((api) => api.listPets())
      .then((pets) => router.push(openTarget(data, userId, pets) as never))
      .catch(() => router.push('/pets'))
  }, [response, loading, userId])

  const [asking, setAsking] = useState<{ about: string; denied: boolean } | null>(null)
  const [days, setDays] = useState(3)

  const planSaved = useCallback(
    (plan: Pick<DueItem, 'kind' | 'name' | 'targets'>) => {
      refresh()
      void (async () => {
        const [state, notNowUntil, settings] = await Promise.all([permissionState(), reminderStore.notNowUntil(), reminderStore.settings()])
        if (state === 'granted' || !settings.enabled || !shouldAsk(notNowUntil)) return
        setDays(settings.daysBefore)
        setAsking({ about: reminderAbout(tRef.current, plan), denied: state === 'denied' })
      })().catch(() => {})
    },
    [refresh],
  )

  async function remind() {
    const denied = asking?.denied
    setAsking(null)
    if (denied) {
      void Linking.openSettings()
      return
    }
    if ((await askPermission().catch(() => 'denied')) === 'granted') refresh()
  }

  function notNow() {
    setAsking(null)
    void reminderStore.notNow().catch(() => {})
  }

  const value = useMemo(() => ({ refresh, planSaved }), [refresh, planSaved])

  return (
    <RemindersContext.Provider value={value}>
      {children}
      <Modal visible={asking !== null} transparent animationType="slide" onRequestClose={notNow}>
        <Pressable style={styles.backdrop} onPress={notNow} accessible={false}>
          <Pressable style={styles.sheet} onPress={() => {}} accessible={false} accessibilityViewIsModal>
            <View style={styles.handle} />
            <Text variant="h2">{asking ? words.askTitle(asking.about) : ''}</Text>
            <Text tone="muted" style={styles.body}>
              {asking?.denied ? words.deniedBody : words.askBody(days)}
            </Text>
            <Button title={asking?.denied ? words.openSettings : words.remind} onPress={() => void remind()} />
            <Button title={words.notNow} kind="secondary" onPress={notNow} style={styles.second} />
          </Pressable>
        </Pressable>
      </Modal>
    </RemindersContext.Provider>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,21,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colour.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colour.line,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: space.row,
  },
  body: { marginTop: 8, marginBottom: space.section },
  second: { marginTop: space.row },
})
