import { Redirect } from 'expo-router'
import { Tabs } from 'expo-router/tabs'
import { useEffect } from 'react'
import { withFreshSession } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { useSetLocale, useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { colour, type } from '@/ui/theme'

/**
 * The three places the app goes: the pets, a check, and the account.
 *
 * Everything behind a sign-in lives here, and the guard is on the group rather
 * than repeated on each screen — a screen that forgets it would otherwise call
 * the API with no session and show its own error instead of the sign-in form.
 */
export default function TabsLayout() {
  const { session, loading } = useAuth()
  const t = useText()
  const setLocale = useSetLocale()

  /**
   * The account's language, asked for once on the way in.
   *
   * Until this answers, the interface speaks whatever the device does — which
   * is also what a brand-new account was created in, so the two usually agree.
   * A person who chose the other language gets it here rather than only after
   * visiting the profile.
   */
  useEffect(() => {
    if (!session) return
    void withFreshSession((api) => api.getMe())
      .then((me) => setLocale(me.locale))
      .catch(() => {})
  }, [session, setLocale])

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colour.canvas },
        tabBarActiveTintColor: colour.accent,
        tabBarInactiveTintColor: colour.faint,
        tabBarStyle: {
          backgroundColor: colour.surface,
          borderTopWidth: 1,
          borderTopColor: colour.line,
          paddingTop: 8,
        },
        tabBarLabelStyle: type.tab,
      }}
    >
      <Tabs.Screen
        name="pets"
        options={{
          title: t.tabs.pets,
          tabBarIcon: ({ color }) => <Icon name="paw" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="check"
        options={{
          title: t.tabs.check,
          tabBarIcon: ({ color }) => <Icon name="checkup" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabs.profile,
          tabBarIcon: ({ color }) => <Icon name="profile" color={String(color)} />,
        }}
      />
    </Tabs>
  )
}
