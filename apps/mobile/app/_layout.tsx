import { useEffect } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Stack, useRouter } from 'expo-router'
import { useFonts } from 'expo-font'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/providers/AuthProvider'
import { UpdatePrompt } from '@/features/updates/UpdatePrompt'
import { ReminderProvider } from '@/features/medical-record/reminders/ReminderProvider'
import { LocaleProvider, dictionary } from '@/i18n'
import { parseAuthLink } from '@/lib/auth-links'
import { redeemAuthLink, type LinkAuth } from '@/features/auth/redeem-link'
import { deviceLocale } from '@/lib/device-locale'
import { persistOptions, queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import { arrivalOptions, linkPendingOptions, stackOptions } from '@/ui/stack'
import { BootScreen } from '@/ui/BootScreen'

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
      // Ours, but nothing to act on: off the blank auth screen to where the
      // app would have opened anyway.
      if (!link) {
        if (/^lapka:\/\/auth\/(callback|confirm|recover)\b/.test(raw)) router.replace('/')
        return
      }

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
        router.replace(link.kind === 'recover' ? '/reset-password' : '/pets')
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
  // jumps — jarring on a screen someone is reading for reassurance. The frame
  // held is the splash's own, so the wait does not show as a blank page.
  const [fontsReady] = useFonts({
    Nunito: require('../assets/fonts/Nunito.ttf'),
    Manrope: require('../assets/fonts/Manrope.ttf'),
  })

  if (!fontsReady) return <BootScreen />

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <LocaleProvider>
        <AuthProvider>
          <ReminderProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={stackOptions}>
              <Stack.Screen name="index" options={arrivalOptions} />
              <Stack.Screen name="sign-in" options={arrivalOptions} />
              <Stack.Screen name="(tabs)" options={arrivalOptions} />
              <Stack.Screen name="consent" options={arrivalOptions} />
              <Stack.Screen name="auth/callback" options={linkPendingOptions} />
              <Stack.Screen name="auth/confirm" options={linkPendingOptions} />
              <Stack.Screen name="auth/recover" options={linkPendingOptions} />
              <Stack.Screen name="auth/provider" options={arrivalOptions} />
            </Stack>
            <UpdatePrompt />
          </ReminderProvider>
        </AuthProvider>
      </LocaleProvider>
    </PersistQueryClientProvider>
  )
}
