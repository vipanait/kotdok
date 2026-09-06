import { Redirect } from 'expo-router'
import { ActivityIndicator } from 'react-native'
import { useAuth } from '@/providers/AuthProvider'
import { Screen } from '@/ui/Screen'

/** Sends the visitor to the right place once the stored session has been read. */
export default function Index() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <Screen title="Лапка">
        <ActivityIndicator />
      </Screen>
    )
  }

  return <Redirect href={session ? '/pets' : '/sign-in'} />
}
