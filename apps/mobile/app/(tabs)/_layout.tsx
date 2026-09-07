import { Redirect } from 'expo-router'
import { Tabs } from 'expo-router/tabs'
import { useAuth } from '@/providers/AuthProvider'
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
          title: 'Питомцы',
          tabBarIcon: ({ color }) => <Icon name="paw" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="check"
        options={{
          title: 'Проверка',
          tabBarIcon: ({ color }) => <Icon name="checkup" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color }) => <Icon name="profile" color={String(color)} />,
        }}
      />
    </Tabs>
  )
}
