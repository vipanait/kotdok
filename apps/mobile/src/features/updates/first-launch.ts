import { File, Paths } from 'expo-file-system'

/**
 * Whether this run is the first since the app was installed.
 *
 * A marker file in the documents folder: it survives restarts and app updates,
 * and goes with the app when it is deleted. Not the keychain — on iOS that
 * outlives a reinstall. Not the caches folder — the system may empty it, and
 * every later run would then look like a first one. Signing out leaves it: it
 * says nothing about the account.
 *
 * Decided once per process, so asking again later in the same run gives the
 * same answer although the marker exists by then.
 */
let firstLaunch: boolean | null = null

export function isFirstLaunch(): boolean {
  if (firstLaunch !== null) return firstLaunch
  try {
    const marker = new File(Paths.document, 'lapka-launched')
    firstLaunch = !marker.exists
    if (firstLaunch) marker.create()
  } catch {
    // Treat an unreadable folder as a launch like any other: the worst case is
    // one restart question too many.
    firstLaunch = false
  }
  return firstLaunch
}
