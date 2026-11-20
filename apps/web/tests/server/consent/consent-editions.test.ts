import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { CONSENT_EDITIONS_FEATURE, FEATURES_HEADER, PD_CONSENT_LEGACY_VERSION, PD_CONSENT_VERSION } from '@lapka/contracts'
import { consentVersionFor, owesConsent, type AccountContext } from '@/server/auth/account-state'
import { consentEditionOf } from '@/server/api/bearer-auth'
import { consentStatus, recordConsent } from '@/server/consent/consent-service'

vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn(() => ({})) }))

const profile = (pd_consent_required: boolean, pd_consent_version: string | null) => ({
  pd_consent_required,
  pd_consent_version,
})

describe('who owes the personal data consent (second edition)', () => {
  it('asks every account on a current client for the current edition, the oldest ones too', () => {
    // Created before 26 September 2026: no flag, never asked.
    expect(owesConsent(profile(false, null), 'current')).toBe(true)
    expect(owesConsent(profile(true, PD_CONSENT_LEGACY_VERSION), 'current')).toBe(true)
    expect(owesConsent(profile(true, PD_CONSENT_VERSION), 'current')).toBe(false)
    expect(owesConsent(profile(false, PD_CONSENT_VERSION), 'current')).toBe(false)
  })

  it('keeps an old app build on the old rules, so it is never locked out', () => {
    expect(owesConsent(profile(false, null), 'legacy')).toBe(false)
    expect(owesConsent(profile(true, null), 'legacy')).toBe(true)
    expect(owesConsent(profile(true, PD_CONSENT_LEGACY_VERSION), 'legacy')).toBe(false)
    // Consented to the new text on the site: the old build has nothing more to ask.
    expect(owesConsent(profile(true, PD_CONSENT_VERSION), 'legacy')).toBe(false)
  })

  it('tells a current client from an old build by X-Lapka-Features', () => {
    const request = (features?: string) =>
      new NextRequest('https://lapka.my/api/v1/consent', {
        headers: features === undefined ? {} : { [FEATURES_HEADER]: features },
      })
    expect(consentEditionOf(request(`pet-dates,pet-avatar,followup,${CONSENT_EDITIONS_FEATURE}`))).toBe('current')
    expect(consentEditionOf(request(` ${CONSENT_EDITIONS_FEATURE} `))).toBe('current')
    expect(consentEditionOf(request('pet-dates,pet-avatar,followup,pet-documents'))).toBe('legacy')
    expect(consentEditionOf(request())).toBe('legacy')
  })

  it('names to each client the edition it shows', () => {
    expect(consentVersionFor('current')).toBe(PD_CONSENT_VERSION)
    expect(consentVersionFor('legacy')).toBe(PD_CONSENT_LEGACY_VERSION)
    const account: AccountContext = {
      userId: 'u1',
      status: 'active',
      role: 'user',
      locale: 'ru',
      credits: 0,
      pdConsentRequired: true,
      consentEdition: 'legacy',
    }
    expect(consentStatus(account)).toEqual({ required: true, version: PD_CONSENT_LEGACY_VERSION })
    expect(consentStatus({ ...account, consentEdition: 'current' })).toEqual({ required: true, version: PD_CONSENT_VERSION })
  })
})

describe('which editions are recorded', () => {
  const supabase = () => {
    const upsert = vi.fn(async () => ({ error: null }))
    return { client: { from: vi.fn(() => ({ upsert })) } as never, upsert }
  }

  it.each([PD_CONSENT_VERSION, PD_CONSENT_LEGACY_VERSION])('records %s as sent', async (version) => {
    const { client, upsert } = supabase()
    await expect(recordConsent(client, 'u1', { version, source: 'ios' })).resolves.toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', version, source: 'ios' },
      { onConflict: 'user_id,version', ignoreDuplicates: true },
    )
  })

  it('refuses an edition the server does not know', async () => {
    const { client, upsert } = supabase()
    await expect(recordConsent(client, 'u1', { version: '2020-01-01', source: 'web' })).resolves.toEqual({
      ok: false,
      reason: 'stale_version',
    })
    expect(upsert).not.toHaveBeenCalled()
  })
})
