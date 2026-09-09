import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { DELETION_COMPLETION_DAYS } from '@lapka/contracts'
import { api } from '@/lib/api'
import { receiptStorage } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useText } from '@/i18n'
import { deleteAccount } from '@/features/account/deletion'
import { RECEIPT_KEY } from '@/features/account/receipt'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * Deleting the account, from the app (stage 9/01).
 *
 * Says what goes and what stays before asking, because "delete my account" and
 * "delete everything you hold about me" are not the same promise and we can
 * only keep the first. The payment records stay, detached — that is what the
 * data map settled and what the person is entitled to know beforehand.
 *
 * Two confirmations, deliberately different in kind. The dialog confirms the
 * intention; the proof of fresh authentication confirms the person. A dialog
 * alone would let whoever picked up an unlocked phone delete an account.
 */
export default function DeleteAccount() {
  const t = useText()
  const { signOut } = useAuth()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [needsReauth, setNeedsReauth] = useState(false)

  async function confirm() {
    setBusy(true)
    setFailure(null)

    const outcome = await deleteAccount({
      api,
      keepReceipt: (secret) => receiptStorage.setItem(RECEIPT_KEY, secret),
      forgetAccount: () => signOut(),
      // The platform's own CSPRNG. `Math.random` would be wrong here in a way
      // that never shows up in testing: the receipt is a bearer credential, and
      // a guessable one lets somebody else read a stranger's deletion status.
      random: (bytes) => bytes.set(Crypto.getRandomBytes(bytes.length)),
      fallbackMessage: t.errors.internal,
    })

    setAsking(false)
    setBusy(false)

    if (outcome.kind === 'accepted') {
      router.replace('/deletion-status')
      return
    }
    if (outcome.kind === 'reauth_required') {
      setNeedsReauth(true)
      return
    }
    setFailure(outcome.message)
  }

  if (needsReauth) {
    return (
      <Screen title={t.deletion.reauthTitle} onBack={() => router.back()} scroll>
        <Text tone="muted">{t.deletion.reauthBody}</Text>
        <View style={styles.gap} />
        <Button title={t.deletion.reauthAction} onPress={() => void signOut()} />
      </Screen>
    )
  }

  return (
    <Screen
      title={t.deletion.title}
      onBack={() => router.back()}
      scroll
      dock={
        <Button
          title={t.deletion.confirm}
          kind="outlineDanger"
          disabled={busy}
          onPress={() => setAsking(true)}
        />
      }
    >
      <Text tone="muted">{t.deletion.lead}</Text>

      <View style={styles.gap} />
      <Text variant="h3">{t.deletion.goesTitle}</Text>
      <Text tone="muted">{t.deletion.goes}</Text>

      <View style={styles.gap} />
      <Text variant="h3">{t.deletion.staysTitle}</Text>
      <Text tone="muted">{t.deletion.stays}</Text>

      <View style={styles.gap} />
      <Banner text={t.deletion.timing(DELETION_COMPLETION_DAYS)} />

      {failure ? <Banner text={failure} tone="error" style={styles.error} /> : null}

      <ConfirmDialog
        visible={asking}
        title={t.deletion.confirmTitle}
        message={t.deletion.confirmBody}
        confirmTitle={t.deletion.confirm}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.section },
  error: { marginTop: space.block },
})
