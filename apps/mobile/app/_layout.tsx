import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { useFonts } from 'expo-font'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { AuthProvider } from '@/providers/AuthProvider'
import { LocaleProvider, dictionary } from '@/i18n'
import { parseAuthLink } from '@/lib/auth-links'
import { deviceLocale } from '@/lib/device-locale'
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
    // This runs above `LocaleProvider`, so there is no dictionary hook to
    // reach for. The device's language is the right source anyway: a link
    // from an email arrives before anyone has signed in, and the account's
    // own choice is not known yet.
    const t = dictionary(deviceLocale())

    async function handle(raw: string | null) {
      if (!raw) return

      const link = parseAuthLink(raw)
      if (!link) return

      if (link.kind === 'error') {
        router.replace({
          pathname: '/sign-in',
          params: { notice: link.description ?? t.auth.linkExpired },
        })
        return
      }

      // Caught, not just checked. A reused or expired credential comes back as
      // `{ error }`, but a malformed one is thrown: a token that is not valid
      // base64 makes `setSession` raise "Invalid UTF-8 sequence" before it can
      // return anything. Left uncaught that is an unhandled rejection — no
      // notice, and the reader is stranded on whatever screen the link routed
      // to. Both endings are the same to the person holding the phone, so both
      // get the same sentence.
      let failed = false
      try {
        const { error } =
          link.credential.via === 'code'
            ? await supabase.auth.exchangeCodeForSession(link.credential.code)
            : await supabase.auth.setSession({
                access_token: link.credential.accessToken,
                refresh_token: link.credential.refreshToken,
              })
        failed = Boolean(error)
      } catch {
        failed = true
      }

      if (failed) {
        router.replace({ pathname: '/sign-in', params: { notice: t.auth.linkExpired } })
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
