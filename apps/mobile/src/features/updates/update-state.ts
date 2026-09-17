/**
 * What the app does about over-the-air updates, apart from the native module.
 *
 * expo-updates downloads a new bundle on its own; these rules decide when the
 * person is asked to restart into it and how the running update is named on the
 * profile screen, so a tester can tell that what was published has arrived.
 */

/** Resuming more often than this does not ask the server again. */
export const RESUME_CHECK_INTERVAL_MS = 60_000

export function shouldCheckOnResume({
  enabled,
  busy,
  lastCheckAt,
  now,
}: {
  /** False in development builds served by Metro, where there is nothing to check. */
  enabled: boolean
  /** A check or download is already running. */
  busy: boolean
  lastCheckAt: number | null
  now: number
}): boolean {
  if (!enabled || busy) return false
  return lastCheckAt === null || now - lastCheckAt >= RESUME_CHECK_INTERVAL_MS
}

export function shouldOfferRestart({
  pendingUpdateId,
  declinedUpdateId,
  editing,
}: {
  /** The downloaded update waiting for a restart, if any. */
  pendingUpdateId: string | null
  /** The update the person already answered "Later" to. */
  declinedUpdateId: string | null
  /** A screen holds unsaved changes that a restart would throw away. */
  editing: boolean
}): boolean {
  if (!pendingUpdateId || editing) return false
  // "Later" means later for this update; a newer one is worth asking about.
  return pendingUpdateId !== declinedUpdateId
}

/** Enough of the id to match it against the EAS dashboard by eye. */
export const SHORT_UPDATE_ID_LENGTH = 8

/**
 * The running update as the profile shows it, or null when the app runs the
 * bundle it was built with — then the version number already says everything.
 */
export function runningUpdate({
  isEmbeddedLaunch,
  updateId,
  createdAt,
}: {
  isEmbeddedLaunch: boolean
  updateId?: string
  createdAt?: Date
}): { id: string; createdAt: Date } | null {
  if (isEmbeddedLaunch || !updateId || !createdAt) return null
  return { id: updateId.slice(0, SHORT_UPDATE_ID_LENGTH), createdAt }
}
