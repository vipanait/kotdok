import { describe, expect, it } from 'vitest'
import {
  RESUME_CHECK_INTERVAL_MS,
  runningUpdate,
  shouldCheckOnResume,
  shouldOfferRestart,
} from './update-state'

describe('checking for an update on resume', () => {
  const base = { enabled: true, busy: false, lastCheckAt: null, now: 1_000_000 }

  it('checks the first time', () => {
    expect(shouldCheckOnResume(base)).toBe(true)
  })

  it('does nothing where updates are off, as in a development build', () => {
    expect(shouldCheckOnResume({ ...base, enabled: false })).toBe(false)
  })

  it('does not start a second check while one is running', () => {
    expect(shouldCheckOnResume({ ...base, busy: true })).toBe(false)
  })

  it('waits out the interval between checks', () => {
    const lastCheckAt = base.now - RESUME_CHECK_INTERVAL_MS + 1
    expect(shouldCheckOnResume({ ...base, lastCheckAt })).toBe(false)
    expect(shouldCheckOnResume({ ...base, lastCheckAt: base.now - RESUME_CHECK_INTERVAL_MS })).toBe(true)
  })
})

describe('offering a restart', () => {
  it('stays quiet with nothing downloaded', () => {
    expect(shouldOfferRestart({ pendingUpdateId: null, declinedUpdateId: null, editing: false })).toBe(false)
  })

  it('asks once an update is downloaded', () => {
    expect(shouldOfferRestart({ pendingUpdateId: 'a', declinedUpdateId: null, editing: false })).toBe(true)
  })

  it('waits while a screen holds unsaved changes', () => {
    expect(shouldOfferRestart({ pendingUpdateId: 'a', declinedUpdateId: null, editing: true })).toBe(false)
  })

  it('does not ask again about an update put off with "Later"', () => {
    expect(shouldOfferRestart({ pendingUpdateId: 'a', declinedUpdateId: 'a', editing: false })).toBe(false)
  })

  it('asks about a newer update after an older one was put off', () => {
    expect(shouldOfferRestart({ pendingUpdateId: 'b', declinedUpdateId: 'a', editing: false })).toBe(true)
  })
})

describe('the running update on the profile', () => {
  const createdAt = new Date('2026-09-17T21:40:00Z')

  it('is not shown for the bundle the build shipped with', () => {
    expect(runningUpdate({ isEmbeddedLaunch: true, updateId: 'x', createdAt })).toBeNull()
  })

  it('is not shown where updates are off', () => {
    expect(runningUpdate({ isEmbeddedLaunch: false })).toBeNull()
  })

  it('names a downloaded update by the start of its id and its date', () => {
    expect(
      runningUpdate({
        isEmbeddedLaunch: false,
        updateId: '0198f2c4-7e1a-4b6d-9c3e-2f5a8b7d6e10',
        createdAt,
      }),
    ).toEqual({ id: '0198f2c4', createdAt })
  })
})
