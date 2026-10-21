/**
 * The first entry's choice (design of 20 October 2026), as the site keeps
 * it: «С чего начнём?» once for a new account, and a path begun — a check,
 * or the health record — goes on after a reload or a new sign-in until a pet
 * is saved on it. Kept in a cookie per account, so the server draws the
 * right overview on the first paint; another account on the same browser
 * starts afresh. Only the path is kept here, never anything about a pet.
 * Not synchronised across devices: the phone keeps its own.
 */

export type OnboardingGoal = 'check' | 'health'

export type OnboardingState = {
  /** Skipped («Пока просто посмотрю») or finished: never shown again. */
  seen: boolean
  /** The path chosen and not finished yet: no pet has been saved on it. */
  goal: OnboardingGoal | null
}

export const ONBOARDING_EMPTY: OnboardingState = { seen: false, goal: null }

export const ONBOARDING_COOKIE = 'lapka_onboarding'

/** Bumped when the stored shape changes: an older cookie is read as a first entry. */
const VERSION = 1

/** Accounts remembered on one browser; the oldest goes first. */
const ACCOUNTS_MAX = 5

type Stored = { s?: unknown; g?: unknown }

/** `?goal=` or a stored goal, read strictly: anything else is no goal, never an address. */
export function parseGoal(value: unknown): OnboardingGoal | null {
  return value === 'check' || value === 'health' ? value : null
}

function accounts(raw: string | null | undefined): [string, Stored][] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw))
    if (!parsed || typeof parsed !== 'object' || (parsed as { v?: unknown }).v !== VERSION) return []
    const map = (parsed as { a?: unknown }).a
    if (!map || typeof map !== 'object' || Array.isArray(map)) return []
    return Object.entries(map as Record<string, unknown>).filter(
      (entry): entry is [string, Stored] => !!entry[1] && typeof entry[1] === 'object',
    )
  } catch {
    return []
  }
}

/** This account's state; anything unreadable is a first entry. */
export function readOnboarding(raw: string | null | undefined, userId: string): OnboardingState {
  const stored = accounts(raw).find(([id]) => id === userId)?.[1]
  if (!stored) return ONBOARDING_EMPTY
  return { seen: stored.s === true, goal: parseGoal(stored.g) }
}

/** The cookie's new value with this account's state, the account moved to the newest place. */
export function writeOnboarding(raw: string | null | undefined, userId: string, state: OnboardingState): string {
  const others = accounts(raw).filter(([id]) => id !== userId)
  const kept = [...others, [userId, { s: state.seen, g: state.goal }] as [string, Stored]].slice(-ACCOUNTS_MAX)
  return encodeURIComponent(JSON.stringify({ v: VERSION, a: Object.fromEntries(kept) }))
}

export function chooseGoal(state: OnboardingState, goal: OnboardingGoal): OnboardingState {
  return { ...state, goal }
}

const SEEN: OnboardingState = { seen: true, goal: null }

/** «Пока просто посмотрю»: whatever was chosen before, the ordinary overview from now on. */
export function skipOnboarding(): OnboardingState {
  return SEEN
}

/** A pet was saved: nothing to resume, and the choice is not offered again. */
export function finishOnboarding(): OnboardingState {
  return SEEN
}

/**
 * «С чего начнём?» instead of the overview: an account with nothing yet —
 * no pets and no checks — that has not skipped or finished it. An owner who
 * deleted every pet still has checks, or a finished state, and is not asked.
 */
export function showWelcome(state: OnboardingState, has: { pets: number; checks: number }): boolean {
  return !state.seen && has.pets === 0 && has.checks === 0
}

export function newPetHref(goal: OnboardingGoal | null): string {
  return goal ? `/pets/new?goal=${goal}` : '/pets/new'
}

/**
 * Where a new pet's form leads: the check with this pet, «Добавим первую
 * запись?», or — added the ordinary way — the optional first steps.
 */
export function petCreatedHref(goal: OnboardingGoal | null, petId: string): string {
  if (goal === 'check') return `/check?pet=${petId}`
  if (goal === 'health') return `/pets/${petId}/first-record`
  return `/pets/${petId}/first-steps`
}
