import { deviceStorage } from '@/lib/supabase'
import { createOnboardingStore } from './onboarding-store'

/** On this phone, in the keychain with the session: see `onboarding-store`. */
export const onboardingStore = createOnboardingStore(deviceStorage)

/**
 * A path begun before a restart is resumed once per launch and account, and
 * only from the first read: a person who chose a path in this launch and
 * backed out of it is back at the choice, not sent in again.
 */
const settled = new Set<string>()
export function resumeOnce(userId: string): boolean {
  if (settled.has(userId)) return false
  settled.add(userId)
  return true
}
/** A choice made in this launch: nothing is left to resume for it. */
export function settle(userId: string): void {
  settled.add(userId)
}
