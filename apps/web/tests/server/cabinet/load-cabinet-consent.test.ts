import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAccount } from '@/server/auth/account-state'
import { loadCabinetState } from '@/server/cabinet/load-cabinet'

vi.mock('@/server/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@example.test' } } }) },
  })),
  createServiceClient: vi.fn(() => ({})),
}))
vi.mock('@/server/auth/account-state', () => ({ loadAccount: vi.fn() }))

const account = {
  userId: 'u1',
  status: 'active' as const,
  role: 'user' as const,
  locale: 'ru' as const,
  credits: 1,
  pdConsentRequired: false,
}

describe('the cabinet and consent', () => {
  beforeEach(() => {
    vi.mocked(loadAccount).mockReset()
  })

  it('closes the cabinet to a new account that has not consented', async () => {
    vi.mocked(loadAccount).mockResolvedValue({ ok: true, account: { ...account, pdConsentRequired: true } })

    await expect(loadCabinetState()).resolves.toEqual({ kind: 'consent_required' })
  })

  it('opens it once nothing is owed', async () => {
    vi.mocked(loadAccount).mockResolvedValue({ ok: true, account })

    await expect(loadCabinetState()).resolves.toMatchObject({ kind: 'open' })
  })
})
