import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import type { AccountDeletionStatus } from '@lapka/contracts'
import { api } from '@/lib/api'
import { receiptStorage } from '@/lib/supabase'
import { RECEIPT_KEY } from '@/features/account/receipt'
import { useText } from '@/i18n'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

type Status = AccountDeletionStatus['status'] | 'missing'

/**
 * Whether the deletion finished (stage 9/04, the reading end).
 *
 * Outside the tabs on purpose: by the time anybody looks at this the session is
 * gone, so there is no profile tab to put it in. The receipt in the keychain is
 * the only credential, which is exactly why it was written down before the
 * request was sent rather than after the answer came back.
 *
 * It never says "finished" unless the server did. A screen that guessed would
 * be worse than one that says "not yet": somebody would stop checking.
 */
export default function DeletionStatus() {
  const t = useText()
  const [status, setStatus] = useState<Status | null>(null)

  const load = useCallback(async () => {
    const receipt = await receiptStorage.getItem(RECEIPT_KEY)
    if (!receipt) {
      setStatus('missing')
      return
    }

    try {
      setStatus((await api.getAccountDeletionStatus(receipt)).status)
    } catch {
      // An unknown receipt and an unreachable server look the same from here,
      // and neither is a reason to claim the deletion is done.
      setStatus('missing')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (status === null) {
    return (
      <Screen title={t.deletion.statusTitle}>
        <ActivityIndicator color={colour.accent} />
      </Screen>
    )
  }

  const said = {
    pending: { title: t.deletion.statusPending, body: t.deletion.statusPendingBody },
    completed: { title: t.deletion.statusCompleted, body: t.deletion.statusCompletedBody },
    action_required: {
      title: t.deletion.statusActionRequired,
      body: t.deletion.statusActionRequiredBody,
    },
    missing: { title: t.deletion.statusMissing, body: t.deletion.statusMissingBody },
  }[status]

  return (
    <Screen
      title={t.deletion.statusTitle}
      scroll
      dock={
        status === 'completed' || status === 'missing' ? (
          <Button
            title={t.deletion.forget}
            onPress={() => {
              // Nothing left to ask about, so the secret goes too.
              void receiptStorage.removeItem(RECEIPT_KEY)
              router.replace('/sign-in')
            }}
          />
        ) : (
          <Button title={t.deletion.refresh} kind="secondary" onPress={() => void load()} />
        )
      }
    >
      <Text variant="h2">{said.title}</Text>
      <View style={styles.gap} />
      <Text tone="muted">{said.body}</Text>

      {status === 'action_required' ? (
        <>
          <View style={styles.gap} />
          <Banner text={t.deletion.statusActionRequiredBody} tone="error" />
        </>
      ) : null}

      <View style={styles.gap} />
      <LinkButton title={t.common.toPets} onPress={() => router.replace('/sign-in')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.block },
})
