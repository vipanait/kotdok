import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import { PASSWORD_MIN, credentialsProblem } from './credentials'

describe('checking a sign-in form before it is sent', () => {
  it('asks for both fields only when both are empty', () => {
    expect(credentialsProblem(ru, { kind: 'sign-in', email: '', password: '' })).toBe(
      ru.errors.fillBoth,
    )
    expect(credentialsProblem(ru, { kind: 'sign-in', email: ' ', password: 'secret' })).toBe(
      ru.errors.emailRequired,
    )
    expect(
      credentialsProblem(ru, { kind: 'sign-in', email: 'anna@example.com', password: '' }),
    ).toBe(ru.errors.passwordRequired)
  })

  it('names a malformed address instead of asking to fill the fields', () => {
    // Registration with "notanemail" and a long password used to say «Заполните
    // оба поля» — both were filled.
    expect(
      credentialsProblem(ru, { kind: 'sign-up', email: 'notanemail', password: 'long-enough' }),
    ).toBe(ru.errors.emailInvalid)
  })

  it('holds a new password to the length the server wants, and an old one to nothing', () => {
    const short = 'a'.repeat(PASSWORD_MIN - 1)
    expect(credentialsProblem(ru, { kind: 'sign-up', email: 'a@b.co', password: short })).toBe(
      ru.errors.passwordShort(PASSWORD_MIN),
    )
    expect(credentialsProblem(ru, { kind: 'new-password', password: short })).toBe(
      ru.errors.passwordShort(PASSWORD_MIN),
    )
    // Accounts made before the rule, or elsewhere, may have shorter ones.
    expect(credentialsProblem(ru, { kind: 'sign-in', email: 'a@b.co', password: short })).toBeNull()
  })

  it('never mentions two fields on the one-field recovery screen', () => {
    expect(credentialsProblem(ru, { kind: 'recover', email: '' })).toBe(ru.errors.emailRequired)
    expect(credentialsProblem(ru, { kind: 'recover', email: 'anna@' })).toBe(ru.errors.emailInvalid)
    expect(credentialsProblem(ru, { kind: 'recover', email: ' anna@example.com ' })).toBeNull()
  })
})
