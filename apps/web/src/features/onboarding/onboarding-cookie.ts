import { ONBOARDING_COOKIE, readOnboarding, writeOnboarding, type OnboardingState } from './onboarding-state'

function rawCookie(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${ONBOARDING_COOKIE}=`))
    ?.slice(ONBOARDING_COOKIE.length + 1)
}

/**
 * Changes this account's first-entry state in the browser: a year, the
 * whole site, not sent to other sites. A blocked cookie only means the
 * choice is offered again — nothing else depends on it being kept.
 */
export function updateOnboarding(userId: string, change: (state: OnboardingState) => OnboardingState): void {
  try {
    const raw = rawCookie()
    const value = writeOnboarding(raw, userId, change(readOnboarding(raw, userId)))
    document.cookie = `${ONBOARDING_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
  } catch {
    // Cookies off: the welcome is simply offered again.
  }
}
