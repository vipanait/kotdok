import { NextRequest, NextResponse } from 'next/server'
import { signOutCurrentUser } from '@/server/auth/sign-out'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  await signOutCurrentUser()
  const origin = new URL(request.url).origin
  return NextResponse.redirect(new URL('/login', origin), { status: 302 })
}
