import { describe, expect, it, vi } from 'vitest'
import { consentSource, onceUntilReset, settleConsent } from './consent-gate'

describe('consentSource', () => {
  it('names the platform the consent was given on', () => {
    expect(consentSource('ios')).toBe('ios')
    expect(consentSource('android')).toBe('android')
  })
})

describe('settleConsent', () => {
  it('hands over a pending consent before asking what is owed', async () => {
    const calls: string[] = []

    const result = await settleConsent({
      pending: true,
      give: async () => {
        calls.push('give')
      },
      status: async () => {
        calls.push('status')
        return { required: false }
      },
    })

    expect(calls).toEqual(['give', 'status'])
    expect(result).toBe('open')
  })

  it('sends nothing when nothing was ticked', async () => {
    const give = vi.fn(async () => {})

    const result = await settleConsent({ pending: false, give, status: async () => ({ required: true }) })

    expect(give).not.toHaveBeenCalled()
    expect(result).toBe('consent')
  })

  it('still asks when the hand-over failed, so the consent screen catches it', async () => {
    const result = await settleConsent({
      pending: true,
      give: async () => {
        throw new Error('offline')
      },
      status: async () => ({ required: true }),
    })

    expect(result).toBe('consent')
  })

  it('lets the person in when the status cannot be read', async () => {
    // The server still refuses with consent_required, and that brings the
    // consent screen up; a failed read is no reason to block the app.
    const result = await settleConsent({
      pending: false,
      give: async () => {},
      status: async () => {
        throw new Error('offline')
      },
    })

    expect(result).toBe('open')
  })
})

describe('onceUntilReset', () => {
  it('goes to the consent screen once however many requests are refused together', () => {
    const go = vi.fn()
    const redirect = onceUntilReset(go)

    redirect.fire()
    redirect.fire()
    redirect.fire()

    expect(go).toHaveBeenCalledTimes(1)
  })

  it('goes again after the consent screen is done with', () => {
    const go = vi.fn()
    const redirect = onceUntilReset(go)

    redirect.fire()
    redirect.reset()
    redirect.fire()

    expect(go).toHaveBeenCalledTimes(2)
  })
})
