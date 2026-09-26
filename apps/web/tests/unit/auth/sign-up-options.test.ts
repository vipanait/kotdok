import { describe, expect, it } from 'vitest'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { emailSignUpOptions } from '@/features/auth/lib/sign-up-options'

describe('email sign-up on the site', () => {
  it('hands the trigger the language the page is shown in', () => {
    // The profile trigger reads `locale` from the sign-up metadata and makes
    // anything but "ru" English, so a Russian page that sends nothing gets
    // English analyses.
    expect(emailSignUpOptions('https://lapka.my', '/dashboard', 'ru').data.locale).toBe('ru')
    expect(emailSignUpOptions('https://lapka.my', '/dashboard', 'en').data.locale).toBe('en')
  })

  it('returns through the callback to where the person was going', () => {
    expect(emailSignUpOptions('https://lapka.my', '/checks?x=1', 'ru').emailRedirectTo).toBe(
      'https://lapka.my/auth/callback?next=%2Fchecks%3Fx%3D1',
    )
  })

  it('carries the consent the ticked box gave, for the trigger to record', () => {
    expect(emailSignUpOptions('https://lapka.my', '/dashboard', 'ru').data.pd_consent).toEqual({
      version: PD_CONSENT_VERSION,
      source: 'web',
    })
  })
})
