import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN } from '@/shared/security/password'
import en from '@/shared/i18n/dictionaries/en'
import ru from '@/shared/i18n/dictionaries/ru'

/**
 * The database has the last word on how short a password may be, and both apps
 * repeat that number to the reader. When they disagree the form accepts a
 * password that Supabase then refuses, and the reader is told "weak password"
 * by a screen that just promised the opposite.
 */
function repoFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../../${path}`, import.meta.url)), 'utf8')
}

describe('the shortest password anyone may choose', () => {
  it('is the same number in the database and in this app', () => {
    const configured = repoFile('supabase/config.toml')
      .match(/^minimum_password_length = (\d+)$/m)?.[1]

    expect(Number(configured)).toBe(PASSWORD_MIN)
  })

  it('is the same number the mobile app enforces', () => {
    const mobile = repoFile('apps/mobile/src/features/auth/credentials.ts')
      .match(/PASSWORD_MIN = (\d+)/)?.[1]

    expect(Number(mobile)).toBe(PASSWORD_MIN)
  })

  it('is the number the reader is shown, in both languages', () => {
    for (const dictionary of [en, ru]) {
      expect(dictionary.auth.register.passwordHint).toContain(String(PASSWORD_MIN))
      expect(dictionary.auth.resetPassword.errorTooShort).toContain(String(PASSWORD_MIN))
      expect(dictionary.auth.register.errorWeakPassword).toContain(String(PASSWORD_MIN))
      expect(dictionary.auth.resetPassword.subheading).toContain(String(PASSWORD_MIN))
    }
  })
})
