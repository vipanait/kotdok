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

  return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
}
