import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { ExtraCheckRequestStatus } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useText, type Dictionary } from '@/i18n'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/** What the last request came to, in the words the person needs to hear. */
const outcome = (t: Dictionary): Record<string, { text: string; tone: 'info' | 'error' }> => ({
  pending: { text: t.profile.extraPending, tone: 'info' },
  approved: { text: t.profile.extraApproved, tone: 'info' },
  rejected: { text: t.profile.extraRejected, tone: 'error' },
})

export default function ExtraCheck() {
  const t = useText()
  const [request, setRequest] = useState<ExtraCheckRequestStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setRequest(await withFreshSession((api) => api.getExtraCheckRequest()))
    } catch {
      setError(t.errors.loadRequestFailed)
    }
  }, [t])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function send() {
    setBusy(true)
    setError(null)
    try {
      setRequest(await withFreshSession((api) => api.requestExtraCheck()))
    } catch {
      setError(t.errors.sendRequestFailed)
    } finally {
      setBusy(false)
    }
  }

  const state = request?.status ? outcome(t)[request.status] : null

  return (
    <Screen
      title={t.profile.extraTitle}
      onBack={() => router.back()}
      dock={
        <Button
          title={t.profile.extraSend}
          onPress={() => void send()}
          busy={busy}
          // A pending request is already in the queue; sending it again would
          // only put a second one behind it.
          disabled={request?.status === 'pending'}
        />
      }
    >
      <Text tone="muted">
        {t.profile.extraBody}
      </Text>
      <View style={styles.gap} />

      {state ? <Banner text={state.text} tone={state.tone} /> : null}
      {error ? <Banner text={error} tone="error" /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.section },
})
