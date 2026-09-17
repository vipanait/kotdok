/**
 * The one screen with unsaved changes, as the tab bar sees it.
 *
 * A stack screen can refuse to be popped, but switching tabs is not a pop: the
 * tab changes first, and only then is the old tab's stack emptied. By then the
 * question "save the changes?" would appear over a different tab. So the tab
 * bar asks here before switching, and the screen that registered answers.
 */

/** Takes over leaving: gets what to do once the person has decided. */
export type TabGuard = (proceed: () => void) => void

let current: TabGuard | null = null
const listeners = new Set<() => void>()

function changed() {
  for (const listener of listeners) listener()
}

/** @returns the function that removes this guard, and only this one. */
export function setTabGuard(guard: TabGuard): () => void {
  current = guard
  changed()
  return () => {
    if (current === guard) {
      current = null
      changed()
    }
  }
}

/**
 * Whether some screen is holding unsaved changes right now. Anything that would
 * throw the screen away — restarting the app for an update — waits for false.
 */
export function hasUnsavedChanges(): boolean {
  return current !== null
}

/** For `useSyncExternalStore`. @returns the unsubscribe function. */
export function subscribeUnsavedChanges(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * @returns true when a screen took the switch over, and the tab bar must not
 * switch on its own.
 */
export function guardTabSwitch(proceed: () => void): boolean {
  if (!current) return false
  current(proceed)
  return true
}
