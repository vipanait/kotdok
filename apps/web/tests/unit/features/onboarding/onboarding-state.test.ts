import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_EMPTY,
  chooseGoal,
  finishOnboarding,
  newPetHref,
  parseGoal,
  petCreatedHref,
  readOnboarding,
  showWelcome,
  skipOnboarding,
  writeOnboarding,
} from '@/shared/onboarding/onboarding-state'

const ANNA = '11111111-1111-4111-8111-111111111111'
const BORIS = '22222222-2222-4222-8222-222222222222'
const PET = '33333333-3333-4333-8333-333333333333'

describe('the goal a URL or a cookie names', () => {
  it('reads only the two goals', () => {
    expect(parseGoal('check')).toBe('check')
    expect(parseGoal('health')).toBe('health')
  })

  it('reads anything else as no goal, never as a place to go', () => {
    for (const value of ['https://evil.example', '/admin', 'CHECK', '', undefined, null, ['check'], 42]) {
      expect(parseGoal(value)).toBeNull()
    }
  })
})

describe('the first entry of a new account', () => {
  it('shows «С чего начнём?» to an account with no pets and no checks', () => {
    expect(showWelcome(ONBOARDING_EMPTY, { pets: 0, checks: 0 })).toBe(true)
  })

  it('never shows it to an owner who already has pets', () => {
    expect(showWelcome(ONBOARDING_EMPTY, { pets: 1, checks: 0 })).toBe(false)
  })

  it('never shows it to an owner who already ran checks (their pets may be deleted)', () => {
    expect(showWelcome(ONBOARDING_EMPTY, { pets: 0, checks: 3 })).toBe(false)
  })

  it('shows it again while a chosen path is not finished, so it can be resumed', () => {
    expect(showWelcome(chooseGoal(ONBOARDING_EMPTY, 'health'), { pets: 0, checks: 0 })).toBe(true)
  })

  it('is said once: after «Пока просто посмотрю» the ordinary overview comes back', () => {
    expect(showWelcome(skipOnboarding(), { pets: 0, checks: 0 })).toBe(false)
  })

  it('stays finished after the owner deletes every pet', () => {
    const finished = finishOnboarding()
    expect(showWelcome(finished, { pets: 0, checks: 0 })).toBe(false)
  })
})

describe('transitions', () => {
  it('choosing keeps the goal until a pet is saved on it', () => {
    expect(chooseGoal(ONBOARDING_EMPTY, 'check')).toEqual({ seen: false, goal: 'check' })
    expect(chooseGoal(chooseGoal(ONBOARDING_EMPTY, 'check'), 'health')).toEqual({ seen: false, goal: 'health' })
  })

  it('skipping or finishing leaves nothing to resume', () => {
    expect(skipOnboarding()).toEqual({ seen: true, goal: null })
    expect(finishOnboarding()).toEqual({ seen: true, goal: null })
  })
})

describe('the cookie, per account', () => {
  it('resumes the goal after a reload or a new sign-in of the same account', () => {
    const cookie = writeOnboarding(undefined, ANNA, chooseGoal(ONBOARDING_EMPTY, 'health'))
    expect(readOnboarding(cookie, ANNA)).toEqual({ seen: false, goal: 'health' })
  })

  it('gives another account on the same browser a first entry of its own', () => {
    const cookie = writeOnboarding(undefined, ANNA, chooseGoal(ONBOARDING_EMPTY, 'check'))
    expect(readOnboarding(cookie, BORIS)).toEqual(ONBOARDING_EMPTY)
  })

  it('keeps the first account when a second one writes', () => {
    const anna = writeOnboarding(undefined, ANNA, skipOnboarding())
    const both = writeOnboarding(anna, BORIS, chooseGoal(ONBOARDING_EMPTY, 'check'))
    expect(readOnboarding(both, ANNA)).toEqual({ seen: true, goal: null })
    expect(readOnboarding(both, BORIS)).toEqual({ seen: false, goal: 'check' })
  })

  it('remembers at most a few accounts, dropping the oldest', () => {
    let cookie: string | undefined
    const ids = Array.from({ length: 7 }, (_, n) => `${n}0000000-0000-4000-8000-000000000000`)
    for (const id of ids) cookie = writeOnboarding(cookie, id, skipOnboarding())
    expect(readOnboarding(cookie, ids[0])).toEqual(ONBOARDING_EMPTY)
    expect(readOnboarding(cookie, ids[6])).toEqual({ seen: true, goal: null })
  })

  it('reads a broken, foreign or older cookie as a first entry', () => {
    for (const raw of ['%7B', 'not json', encodeURIComponent('{"v":0,"a":{}}'), encodeURIComponent('[]'), '']) {
      expect(readOnboarding(raw, ANNA)).toEqual(ONBOARDING_EMPTY)
    }
    const odd = encodeURIComponent(JSON.stringify({ v: 1, a: { [ANNA]: { s: 'yes', g: '/admin' } } }))
    expect(readOnboarding(odd, ANNA)).toEqual(ONBOARDING_EMPTY)
  })
})

describe('where the path goes', () => {
  it('opens the pet form with the goal', () => {
    expect(newPetHref('check')).toBe('/pets/new?goal=check')
    expect(newPetHref('health')).toBe('/pets/new?goal=health')
    expect(newPetHref(null)).toBe('/pets/new')
  })

  it('after the pet is saved: the check with this pet, the first record, or the optional first steps', () => {
    expect(petCreatedHref('check', PET)).toBe(`/check?pet=${PET}`)
    expect(petCreatedHref('health', PET)).toBe(`/pets/${PET}/first-record`)
    expect(petCreatedHref(null, PET)).toBe(`/pets/${PET}/first-steps`)
  })
})
