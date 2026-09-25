import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { useFonts } from 'expo-font'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { AuthProvider } from '@/providers/AuthProvider'
import { UpdatePrompt } from '@/features/updates/UpdatePrompt'
import { ReminderProvider } from '@/features/medical-record/reminders/ReminderProvider'
import { LocaleProvider, dictionary } from '@/i18n'
import { parseAuthLink } from '@/lib/auth-links'
import { redeemAuthLink, type LinkAuth } from '@/features/auth/redeem-link'
import { deviceLocale } from '@/lib/device-locale'
import { supabase } from '@/lib/supabase'
import { colour } from '@/ui/theme'

/** The real client behind the rules in `redeemAuthLink`. */
const linkAuth: LinkAuth = {
  hasSession: async () => Boolean((await supabase.auth.getSession()).data.session),
  exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
  verifyOtp: ({ tokenHash, type }) =>
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }),
}

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
        // The app's own sentence, not the sender's: whatever a link puts in
        // `error_description` would otherwise be shown as if the app said it,
        // which is a free phishing line inside a screen people trust.
        if (__DEV__) console.warn(`Link refused: ${link.code}`, link.description)
        router.replace({ pathname: '/sign-in', params: { notice: t.auth.linkExpired } })
        return
      }

      const outcome = await redeemAuthLink(link.credential, linkAuth)

      // Somebody is signed in on this phone, so the link was not acted on. A
      // recovery link still has somewhere useful to go: the screen it asks for
      // changes the password of the account already open here.
      if (outcome === 'already-signed-in') {
        if (link.kind === 'recover') router.replace('/reset-password')
        return
      }

      if (outcome === 'invalid') {
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
        <ReminderProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colour.canvas },
            }}
          />
          <UpdatePrompt />
        </ReminderProvider>
      </AuthProvider>
    </LocaleProvider>
  )
}
