import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForSession, getSafeNextPath } from '@/server/auth/auth-callback'
import { recordProviderConsent } from '@/server/consent/callback-consent'
import { PROVIDER_CONSENT_COOKIE, PROVIDER_CONSENT_COOKIE_PATH } from '@/shared/consent-cookie'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const safeNext = getSafeNextPath(searchParams.get('next'))

  if (code) {
    const { data, error } = await exchangeCodeForSession(code)
    if (!error) {
      if (data.user) {
        // Never fail a sign-in over this: whoever is left owing consent meets
        // the /consent page on the way into the cabinet.
        await recordProviderConsent(request.cookies.get(PROVIDER_CONSENT_COOKIE)?.value, data.user.id)
          .catch(() => {})
      }
      const response = NextResponse.redirect(new URL(safeNext, origin))
      response.cookies.set(PROVIDER_CONSENT_COOKIE, '', { path: PROVIDER_CONSENT_COOKIE_PATH, maxAge: 0 })
      return response
    }
  }

  // Back to sign-in with the reason, keeping where the person was headed.
  const login = new URL('/login', origin)
  login.searchParams.set('error', 'auth_failed')
  login.searchParams.set('next', safeNext)
  // A cancelled registration does not leave its tick behind for a later
  // sign-in from the login page, where nobody ticked anything.
  const response = NextResponse.redirect(login)
  response.cookies.set(PROVIDER_CONSENT_COOKIE, '', { path: PROVIDER_CONSENT_COOKIE_PATH, maxAge: 0 })
  return response
}
