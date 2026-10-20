import 'server-only'
import { cookies } from 'next/headers'
import { ONBOARDING_COOKIE, readOnboarding, type OnboardingState } from '@/features/onboarding/onboarding-state'

/** This account's first-entry state, from the browser's cookie (see onboarding-state.ts). */
export async function getOnboarding(userId: string): Promise<OnboardingState> {
  return readOnboarding((await cookies()).get(ONBOARDING_COOKIE)?.value, userId)
}
