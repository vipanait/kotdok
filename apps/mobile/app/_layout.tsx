import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/providers/AuthProvider'
import { parseAuthLink } from '@/lib/auth-links'
import { supabase } from '@/lib/supabase'

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

      const { error } = await supabase.auth.exchangeCodeForSession(link.code)
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

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  )
}
