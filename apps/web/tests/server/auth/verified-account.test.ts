import { describe, expect, it, vi } from 'vitest'
import { loadAccount, withVerifiedAccount, type AccountContext } from '@/server/auth/account-state'

const account: AccountContext = {
  userId: '11111111-1111-4111-8111-000000000001',
  status: 'active',
  role: 'user',
  locale: 'ru',
  credits: 3,
  pdConsentRequired: false,
}

/** A client that fails the test if the profile is read at all. */
function untouchable() {
  const from = vi.fn(() => {
    throw new Error('the profile was read again')
  })
  return { client: { from } as never, from }
}

/** A client that answers the profile query with one row. */
function answering(row: Record<string, unknown> | null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  }
  const from = vi.fn(() => query)
  return { client: { from } as never, from }
}

describe('the account a request was verified as', () => {
  it('is reused by the services inside that request', async () => {
    const { client, from } = untouchable()

    const lookup = await withVerifiedAccount(account, () => loadAccount(client, account.userId))

    expect(lookup).toEqual({ ok: true, account })
    expect(from).not.toHaveBeenCalled()
  })

  it('is not used for another user', async () => {
    const { client, from } = answering(null)

    const lookup = await withVerifiedAccount(account, () =>
      loadAccount(client, '22222222-2222-4222-8222-000000000001'),
    )

    expect(lookup).toEqual({ ok: false, reason: 'not_found' })
    expect(from).toHaveBeenCalledWith('profiles')
  })

  it('does not outlive the request', async () => {
    await withVerifiedAccount(account, async () => {})
    const { client, from } = answering({
      id: account.userId,
      status: 'deleting',
      role: 'user',
      locale: 'ru',
      credits: 3,
      pd_consent_required: false,
    })

    const lookup = await loadAccount(client, account.userId)

    expect(lookup).toEqual({ ok: false, reason: 'account_deleting' })
    expect(from).toHaveBeenCalledOnce()
  })
})
