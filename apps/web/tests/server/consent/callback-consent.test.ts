import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { loadAccount } from '@/server/auth/account-state'
import { recordConsent } from '@/server/consent/consent-service'
import { recordProviderConsent } from '@/server/consent/callback-consent'

vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn(() => ({})) }))
vi.mock('@/server/auth/account-state', () => ({ loadAccount: vi.fn() }))
vi.mock('@/server/consent/consent-service', () => ({ recordConsent: vi.fn(async () => ({ ok: true })) }))

const account = {
  userId: 'u1',
  status: 'active' as const,
  role: 'user' as const,
  locale: 'ru' as const,
  credits: 2,
  pdConsentRequired: true,
}

describe('consent carried to the provider callback', () => {
  beforeEach(() => {
    vi.mocked(recordConsent).mockClear()
    vi.mocked(loadAccount).mockResolvedValue({ ok: true, account })
  })

  it.each([
    ['no cookie', undefined],
    ['a stale edition', '2020-01-01'],
    ['garbage', '<script>'],
    ['an empty value', ''],
  ])('records nothing for %s', async (_label, value) => {
    await recordProviderConsent(value, 'u1')

    expect(recordConsent).not.toHaveBeenCalled()
  })

  it('records the current edition for an account that owes it', async () => {
    await recordProviderConsent(PD_CONSENT_VERSION, 'u1')

    expect(recordConsent).toHaveBeenCalledWith(expect.anything(), 'u1', {
      version: PD_CONSENT_VERSION,
      source: 'web',
    })
  })

  it('leaves an account that owes nothing alone', async () => {
    vi.mocked(loadAccount).mockResolvedValue({ ok: true, account: { ...account, pdConsentRequired: false } })

    await recordProviderConsent(PD_CONSENT_VERSION, 'u1')

    expect(recordConsent).not.toHaveBeenCalled()
  })

  it('leaves an account that cannot be read alone', async () => {
    vi.mocked(loadAccount).mockResolvedValue({ ok: false, reason: 'account_deleting' })

    await recordProviderConsent(PD_CONSENT_VERSION, 'u1')

    expect(recordConsent).not.toHaveBeenCalled()
  })
})
