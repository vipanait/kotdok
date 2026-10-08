import { Redirect } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { BootScreen } from '@/ui/BootScreen'

/**
 * The splash. It shows for as long as it takes to read the stored session,
 * which is usually a blink — the same frame the root layout shows while the
 * fonts load, so the two waits look like one.
 */
export default function Index() {
  const { session, loading } = useAuth()

  if (loading) return <BootScreen />

  return <Redirect href={session ? '/pets' : '/sign-in'} />
}
