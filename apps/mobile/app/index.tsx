import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { Logo } from '@/ui/Logo'
import { Screen } from '@/ui/Screen'
import { colour, space } from '@/ui/theme'

/**
 * The splash. It shows for as long as it takes to read the stored session,
 * which is usually a blink — the wordmark and nothing else, so the app does not
 * open on a half-drawn screen.
 */
export default function Index() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <Screen centered>
        <View style={styles.middle}>
          <Logo width={150} />
          <ActivityIndicator color={colour.accent} style={styles.spinner} />
        </View>
      </Screen>
    )
  }

  return <Redirect href={session ? '/pets' : '/sign-in'} />
}

const styles = StyleSheet.create({
  middle: { alignItems: 'center' },
  spinner: { marginTop: space.section },
})
