import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { ExtraCheckRequestStatus } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/** What the last request came to, in the words the person needs to hear. */
const outcome: Record<string, { text: string; tone: 'info' | 'error' }> = {
  pending: { text: 'Запрос отправлен. Ответим в течение дня.', tone: 'info' },
  approved: { text: 'Проверка добавлена на баланс.', tone: 'info' },
  rejected: { text: 'В этот раз не получилось.', tone: 'error' },
}

export default function ExtraCheck() {
  const [request, setRequest] = useState<ExtraCheckRequestStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setRequest(await withFreshSession((api) => api.getExtraCheckRequest()))
    } catch {
      setError('Не удалось загрузить состояние запроса')
    }
  }, [])

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
      setError('Не удалось отправить запрос')
    } finally {
      setBusy(false)
    }
  }

  const state = request?.status ? outcome[request.status] : null

  return (
    <Screen
      title="Дополнительная проверка"
      onBack={() => router.back()}
      dock={
        <Button
          title="Отправить запрос"
          onPress={() => void send()}
          busy={busy}
          // A pending request is already in the queue; sending it again would
          // only put a second one behind it.
          disabled={request?.status === 'pending'}
        />
      }
    >
      <Text tone="muted">
        Расскажем, что случилось, и добавим одну проверку. Обычно отвечаем в течение дня.
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
