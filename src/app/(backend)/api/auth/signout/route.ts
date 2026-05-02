import { NextRequest, NextResponse } from 'next/server'
import { signOutCurrentUser } from '@/server/auth/sign-out'

export async function POST(request: NextRequest) {
  await signOutCurrentUser()
  const origin = new URL(request.url).origin
  return NextResponse.redirect(new URL('/login', origin), { status: 302 })
}
