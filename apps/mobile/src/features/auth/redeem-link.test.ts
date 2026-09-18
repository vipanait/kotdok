import { describe, expect, it, vi } from 'vitest'
import { redeemAuthLink, type LinkAuth } from './redeem-link'

function auth(overrides: Partial<LinkAuth> & { signedIn?: boolean } = {}): LinkAuth {
  const { signedIn = false, ...rest } = overrides
  return {
    hasSession: async () => signedIn,
    exchangeCodeForSession: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    ...rest,
  }
}

describe('redeeming what a link carries', () => {
  it('exchanges a code when nobody is signed in', async () => {
    const deps = auth()

    expect(await redeemAuthLink({ via: 'code', code: 'abc' }, deps)).toBe('signed-in')
    expect(deps.exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('verifies a one-time token as what it was issued for', async () => {
    const deps = auth()

    const outcome = await redeemAuthLink(
      { via: 'otp', tokenHash: 'h4sh', type: 'recovery' },
      deps,
    )

    expect(outcome).toBe('signed-in')
    expect(deps.verifyOtp).toHaveBeenCalledWith({ tokenHash: 'h4sh', type: 'recovery' })
    expect(deps.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('leaves a signed-in account alone', async () => {
    // A link cannot switch accounts behind someone's back: whoever is signed in
    // stays signed in, and what they type next stays in their own account.
    const deps = auth({ signedIn: true })

    expect(await redeemAuthLink({ via: 'code', code: 'abc' }, deps)).toBe('already-signed-in')
    expect(deps.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(deps.verifyOtp).not.toHaveBeenCalled()
  })

  it('reports a spent or expired credential as invalid', async () => {
    const deps = auth({ exchangeCodeForSession: async () => ({ error: new Error('expired') }) })

    expect(await redeemAuthLink({ via: 'code', code: 'abc' }, deps)).toBe('invalid')
  })

  it('reports a malformed credential as invalid rather than throwing', async () => {
    // A token that is not valid base64 makes the client raise before it can
    // return anything; unhandled, that strands the reader on a blank screen.
    const deps = auth({
      verifyOtp: async () => {
        throw new Error('Invalid UTF-8 sequence')
      },
    })

    expect(
      await redeemAuthLink({ via: 'otp', tokenHash: 'bad', type: 'signup' }, deps),
    ).toBe('invalid')
  })
})
