import { describe, expect, it } from 'vitest'
import {
  APP_SCHEME,
  PROVIDER_RETURN_URL,
  authRedirectUrl,
  parseAuthLink,
  parseProviderReturn,
} from './auth-links'

describe('links that come back into the app', () => {
  it('reads an email confirmation', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/callback?code=abc123`)).toEqual({
      kind: 'verify',
      credential: { via: 'code', code: 'abc123' },
    })
  })

  it('reads a password recovery link', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/recover?code=abc123`)).toEqual({
      kind: 'recover',
      credential: { via: 'code', code: 'abc123' },
    })
  })

  it('reads parameters from the fragment, where Supabase puts them', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/callback#code=abc123&type=signup`)).toEqual({
      kind: 'verify',
      credential: { via: 'code', code: 'abc123' },
    })
  })

  it('treats type=recovery as recovery whatever the path says', () => {
    expect(parseAuthLink(`${APP_SCHEME}://auth/callback?code=abc&type=recovery`)).toEqual({
      kind: 'recover',
      credential: { via: 'code', code: 'abc' },
    })
  })

  it('refuses a session handed over whole, whoever it belongs to', () => {
    // A ready-made session in a link is a sign-in nobody on this phone asked
    // for: anyone can send one, and the account it opens is the sender's.
    expect(
      parseAuthLink(
        'lapka://auth/recover#access_token=header.body.sig&refresh_token=r3fr3sh&type=recovery',
      ),
    ).toBeNull()
    expect(parseAuthLink('lapka://auth/callback#access_token=a&refresh_token=r')).toBeNull()
  })

  it('reads the code when a link also carries a session', () => {
    expect(
      parseAuthLink('lapka://auth/callback?code=abc#access_token=xyz&refresh_token=r'),
    ).toEqual({ kind: 'verify', credential: { via: 'code', code: 'abc' } })
  })

  it('reads a one-time token as something to verify, not as a code', () => {
    // `token_hash` is not a PKCE code: exchanging it can only fail. It is
    // checked with the server, and the link says what it was issued for.
    expect(parseAuthLink('lapka://auth/recover?token_hash=h4sh&type=recovery')).toEqual({
      kind: 'recover',
      credential: { via: 'otp', tokenHash: 'h4sh', type: 'recovery' },
    })
    expect(parseAuthLink('lapka://auth/callback?token_hash=h4sh&type=signup')).toEqual({
      kind: 'verify',
      credential: { via: 'otp', tokenHash: 'h4sh', type: 'signup' },
    })
  })

  it('refuses a one-time token that does not say what it is for', () => {
    expect(parseAuthLink('lapka://auth/callback?token_hash=h4sh')).toBeNull()
    expect(parseAuthLink('lapka://auth/callback?token_hash=h4sh&type=nonsense')).toBeNull()
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

describe('what a provider sends back', () => {
  it('reads the code out of the return address', () => {
    expect(parseProviderReturn(`${PROVIDER_RETURN_URL}?code=abc123`)).toEqual({
      kind: 'code',
      code: 'abc123',
    })
  })

  it('reads the provider’s refusal instead of a code', () => {
    expect(
      parseProviderReturn(`${PROVIDER_RETURN_URL}?error=access_denied&error_description=Denied`),
    ).toEqual({ kind: 'error', code: 'access_denied', description: 'Denied' })
  })

  it.each([
    ['a web address wearing our path', 'https://evil.example.com/auth/provider?code=abc'],
    ['the path the emails use', `${APP_SCHEME}://auth/callback?code=abc`],
    ['our path with nothing on it', PROVIDER_RETURN_URL],
    ['nonsense', 'not a url'],
  ])('ignores %s', (_name, link) => {
    expect(parseProviderReturn(link)).toBeNull()
  })

  it('is not mistaken for a link from an email', () => {
    // The two paths are separate so that Android's second delivery of the same
    // link cannot spend the authorization code a second time.
    expect(parseAuthLink(`${PROVIDER_RETURN_URL}?code=abc123`)).toBeNull()
  })
})
