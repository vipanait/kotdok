import type { SecureStorage } from '@/lib/session-storage'

/**
 * The first entry's choice (onboarding, design 20 October 2026), kept on this
 * phone per account: «Пока просто посмотрю» is said once, not at every
 * start, and a path begun — a check, or the health record — goes on after a
 * restart without asking again. Another account on the phone starts afresh.
 */

export type OnboardingGoal = 'check' | 'health'

export type OnboardingState = {
  /** «Пока просто посмотрю»: the ordinary screens from now on. */
  skipped: boolean
  /** The path chosen and not yet finished: no pet has been saved on it. */
  goal: OnboardingGoal | null
}

const EMPTY: OnboardingState = { skipped: false, goal: null }

const key = (userId: string) => `lapka.onboarding.${userId}`

/** Stored state, each field checked on its own; anything unreadable is a first entry. */
export function readOnboarding(raw: string | null): OnboardingState {
  let stored: Partial<Record<keyof OnboardingState, unknown>> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') stored = parsed as typeof stored
  } catch {
    stored = {}
  }
  return {
    skipped: stored.skipped === true,
    goal: stored.goal === 'check' || stored.goal === 'health' ? stored.goal : null,
  }
}

export function createOnboardingStore(storage: SecureStorage) {
  async function read(userId: string): Promise<OnboardingState> {
    return readOnboarding(await storage.getItemAsync(key(userId)).catch(() => null))
  }
  async function write(userId: string, state: OnboardingState) {
    await storage.setItemAsync(key(userId), JSON.stringify(state))
  }
  return {
    read,
    /** «Пока просто посмотрю». */
    skip: async (userId: string) => write(userId, { ...(await read(userId)), skipped: true, goal: null }),
    choose: async (userId: string, goal: OnboardingGoal) => write(userId, { ...(await read(userId)), goal }),
    /** A pet was saved, or the path was left: nothing to resume. */
    finish: async (userId: string) => write(userId, { ...(await read(userId)), goal: null }),
    /** At sign-out: nothing of an account stays on the phone after it. */
    forget: async (userId: string) => storage.deleteItemAsync(key(userId)),
    empty: EMPTY,
  }
}

export type OnboardingStore = ReturnType<typeof createOnboardingStore>
