import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import * as Updates from 'expo-updates'
import { useText } from '@/i18n'
import { ConfirmDialog } from '@/ui/Dialog'
import { hasUnsavedChanges, subscribeUnsavedChanges } from '@/features/unsaved/tab-guard'
import { shouldCheckOnResume, shouldOfferRestart } from './update-state'

/**
 * Asks to restart once an over-the-air update has been downloaded.
 *
 * expo-updates checks by itself only at a cold start, and a phone keeps the app
 * alive for days, so coming back to the app checks too. Downloading is silent;
 * the question appears when there is something to restart into, and not while a
 * form holds unsaved changes. "Later" leaves the update to the next launch.
 */
export function UpdatePrompt() {
  const t = useText()
  const { isUpdatePending, downloadedUpdate, isChecking, isDownloading } = Updates.useUpdates()
  const editing = useSyncExternalStore(subscribeUnsavedChanges, hasUnsavedChanges)
  const [declinedUpdateId, setDeclinedUpdateId] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const lastCheckAt = useRef<number | null>(null)
  const busy = useRef(false)
  busy.current = isChecking || isDownloading

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      const now = Date.now()
      if (
        !shouldCheckOnResume({
          enabled: Updates.isEnabled,
          busy: busy.current,
          lastCheckAt: lastCheckAt.current,
          now,
        })
      ) {
        return
      }
      lastCheckAt.current = now
      void checkAndDownload()
    })
    return () => subscription.remove()
  }, [])

  // A rollback directive carries no id of its own; it still deserves the question.
  const pendingUpdateId = isUpdatePending
    ? (downloadedUpdate && 'updateId' in downloadedUpdate ? downloadedUpdate.updateId : null) ??
      'rollback'
    : null

  const visible = restarting || shouldOfferRestart({ pendingUpdateId, declinedUpdateId, editing })

  async function restart() {
    setRestarting(true)
    try {
      await Updates.reloadAsync()
    } catch {
      // The update stays downloaded and applies at the next launch anyway.
      setRestarting(false)
      setDeclinedUpdateId(pendingUpdateId)
    }
  }

  return (
    <ConfirmDialog
      visible={visible}
      title={t.updates.title}
      message={t.updates.body}
      confirmTitle={t.updates.restart}
      cancelTitle={t.updates.later}
      confirmKind="primary"
      busy={restarting}
      onConfirm={() => void restart()}
      onCancel={() => setDeclinedUpdateId(pendingUpdateId)}
    />
  )
}

async function checkAndDownload() {
  try {
    const check = await Updates.checkForUpdateAsync()
    if (check.isAvailable || check.isRollBackToEmbedded) await Updates.fetchUpdateAsync()
  } catch {
    // No network or the server is down: the next resume or launch tries again.
    // Nothing for the person to do, so nothing is shown.
  }
}
