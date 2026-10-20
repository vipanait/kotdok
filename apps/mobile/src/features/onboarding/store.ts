import { deviceStorage } from '@/lib/supabase'
import { createOnboardingStore } from './onboarding-store'

/** On this phone, in the keychain with the session: see `onboarding-store`. */
export const onboardingStore = createOnboardingStore(deviceStorage)

/**
 * A path begun before a restart is resumed once per launch: after that, a
 * person who backed out of it is back at the choice, not sent in again.
 */
let resumed = false
export function resumeOnce(): boolean {
  if (resumed) return false
  resumed = true
  return true
}
