import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForSession, getSafeNextPath } from '@/server/auth/auth-callback'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const safeNext = getSafeNextPath(searchParams.get('next'))

  if (code) {
    const { error } = await exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, origin))
    }
  }

  // Back to sign-in with the reason, keeping where the person was headed.
  const login = new URL('/login', origin)
  login.searchParams.set('error', 'auth_failed')
  login.searchParams.set('next', safeNext)
  return NextResponse.redirect(login)
}
