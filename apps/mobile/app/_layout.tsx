import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { useFonts } from 'expo-font'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { AuthProvider } from '@/providers/AuthProvider'
import { LocaleProvider } from '@/i18n'
import { parseAuthLink } from '@/lib/auth-links'
import { supabase } from '@/lib/supabase'
import { colour } from '@/ui/theme'

/**
 * Handles links that bring the user back from an email, at cold start and while
 * the app is already open. Only this app's own scheme and its two known paths
 * are acted on; anything else is ignored rather than followed.
 */
function useAuthLinks() {
  const router = useRouter()

  useEffect(() => {
    async function handle(raw: string | null) {
      if (!raw) return

      const link = parseAuthLink(raw)
      if (!link) return

      if (link.kind === 'error') {
        router.replace({
          pathname: '/sign-in',
          params: { notice: link.description ?? 'Ссылка больше не действует.' },
        })
        return
      }

      const { error } =
        link.credential.via === 'code'
          ? await supabase.auth.exchangeCodeForSession(link.credential.code)
          : await supabase.auth.setSession({
              access_token: link.credential.accessToken,
              refresh_token: link.credential.refreshToken,
            })
      if (error) {
        // A reused or expired code must not produce a session, and the user
        // should be told why rather than shown an empty screen.
        router.replace({ pathname: '/sign-in', params: { notice: 'Ссылка больше не действует.' } })
        return
      }

      router.replace(link.kind === 'recover' ? '/reset-password' : '/pets')
    }

    // Cold start: the app was launched by the link.
    Linking.getInitialURL().then(handle)

    // Warm start: the app was already running.
    const subscription = Linking.addEventListener('url', (event) => handle(event.url))
    return () => subscription.remove()
  }, [router])
}

export default function RootLayout() {
  useAuthLinks()

  // The two faces the design is drawn in. Holding the first frame until they
  // land avoids the flash where every heading is the system font and then
  // jumps — jarring on a screen someone is reading for reassurance.
  const [fontsReady] = useFonts({
    Nunito: require('../assets/fonts/Nunito.ttf'),
    Manrope: require('../assets/fonts/Manrope.ttf'),
    // Google's own face, for Google's own button and nothing else: their
    // branding guidelines ask for it by name.
    GoogleSans: require('../assets/fonts/GoogleSans.ttf'),
  })

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: colour.canvas }} />

  return (
    <LocaleProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colour.canvas },
          }}
        />
      </AuthProvider>
    </LocaleProvider>
  )
}
