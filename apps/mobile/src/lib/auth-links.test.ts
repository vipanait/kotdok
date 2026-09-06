import { describe, expect, it } from 'vitest'
import { APP_SCHEME, authRedirectUrl, parseAuthLink } from './auth-links'

describe('links that come back into the app', () => {
  it('reads an email confirmation', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/callback?code=abc123`)).toEqual({
      kind: 'verify',
      code: 'abc123',
    })
  })

  it('reads a password recovery link', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/recover?code=abc123`)).toEqual({
      kind: 'recover',
      code: 'abc123',
    })
  })

  it('reads parameters from the fragment, where Supabase puts them', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/callback#code=abc123&type=signup`)).toEqual({
      kind: 'verify',
      code: 'abc123',
    })
  })

  it('treats type=recovery as recovery whatever the path says', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/callback?code=abc&type=recovery`)).toEqual({
      kind: 'recover',
      code: 'abc',
    })
  })

  it('surfaces a provider error instead of a blank screen', () => {
    expect(
      parseAuthLink(`${APP_SCHEME}://auth/callback#error=access_denied&error_description=Link+expired`),
    ).toEqual({ kind: 'error', code: 'access_denied', description: 'Link expired' })
  })

  it.each([
    ['another app’s scheme', 'othertapp://auth/callback?code=abc'],
    ['a web address', 'https://evil.example/auth/callback?code=abc'],
    ['our scheme but an unknown path', `${APP_SCHEME}://somewhere/else?code=abc`],
    ['our scheme with no code at all', `${APP_SCHEME}://auth/callback`],
    ['nonsense', 'not a url'],
    ['an empty string', ''],
  ])('ignores %s', (_name, link) => {
    expect(parseAuthLink(link)).toBeNull()
  })

  it('builds its own redirect rather than accepting one', () => {
    expect(authRedirectUrl('verify')).toBe(`${APP_SCHEME}://auth/callback`)
    expect(authRedirectUrl('recover')).toBe(`${APP_SCHEME}://auth/recover`)
  })
})
