/**
 * What is wrong with a sign-in form before it is sent, said about that form.
 *
 * Supabase answers an empty or malformed address with one code for everything,
 * `validation_failed`, and there is no telling from it which field it meant. It
 * used to be translated as «Заполните оба поля», which the recovery screen —
 * one field — showed as well, and registration showed with both fields filled.
 * So the obvious mistakes are caught here, where the screen knows its fields.
 */

import type { Dictionary } from '@/i18n'

/**
 * The shortest password the auth server takes.
 *
 * Mirrors `minimum_password_length` in `supabase/config.toml`. Said to the
 * person up front, so they do not learn it from a refusal.
 */
export const PASSWORD_MIN = 8

/**
 * Loose on purpose: something, an @, something with a dot. The server has the
 * final word on what an address is; this only stops the typos that need no
 * server to spot.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CredentialsForm =
  /** Sign-in: both fields, no rules about the password — it already exists. */
  | { kind: 'sign-in'; email: string; password: string }
  /** Registration: both fields, and a password long enough to be accepted. */
  | { kind: 'sign-up'; email: string; password: string }
  /** Recovery: the address alone. */
  | { kind: 'recover'; email: string }
  /** A new password from a recovery link. */
  | { kind: 'new-password'; password: string }

/** @returns the sentence to show, or null when the form can go. */
export function credentialsProblem(t: Dictionary, form: CredentialsForm): string | null {
  switch (form.kind) {
    case 'sign-in':
    case 'sign-up': {
      const email = form.email.trim()
      if (email === '' && form.password === '') return t.errors.fillBoth
      if (email === '') return t.errors.emailRequired
      if (!EMAIL_SHAPE.test(email)) return t.errors.emailInvalid
      if (form.password === '') return t.errors.passwordRequired
      if (form.kind === 'sign-up' && form.password.length < PASSWORD_MIN) {
        return t.errors.passwordShort(PASSWORD_MIN)
      }
      return null
    }
    case 'recover': {
      const email = form.email.trim()
      if (email === '') return t.errors.emailRequired
      if (!EMAIL_SHAPE.test(email)) return t.errors.emailInvalid
      return null
    }
    case 'new-password':
      if (form.password === '') return t.errors.passwordRequired
      if (form.password.length < PASSWORD_MIN) return t.errors.passwordShort(PASSWORD_MIN)
      return null
  }
}
