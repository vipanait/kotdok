import { NextRequest, NextResponse } from 'next/server'

export const CSRF_COOKIE_NAME = 'lapka_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'
export const CSRF_FIELD_NAME = 'csrf_token'

const TOKEN_BYTES = 32

function createToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function isSameOrigin(request: NextRequest): boolean {
  const expected = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin) return origin === expected

  const referer = request.headers.get('referer')
  if (!referer) return true

  try {
    return new URL(referer).origin === expected
  } catch {
    return false
  }
}

function csrfCookieValue(request: NextRequest): string | undefined {
  const nextCookie = request.cookies?.get(CSRF_COOKIE_NAME)?.value
  if (nextCookie) return nextCookie

  const cookieHeader = request.headers.get('cookie')
  return cookieHeader
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=')
}

async function tokenFromRequest(request: NextRequest): Promise<string | null> {
  const headerToken = request.headers.get(CSRF_HEADER_NAME)
  if (headerToken) return headerToken

  const contentType = request.headers.get('content-type') ?? ''
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const formData = await request.formData()
    const fieldToken = formData.get(CSRF_FIELD_NAME)
    return typeof fieldToken === 'string' ? fieldToken : null
  }

  return null
}

export function ensureCsrfCookie(request: NextRequest, response: NextResponse): void {
  if (request.cookies.get(CSRF_COOKIE_NAME)?.value) return

  response.cookies.set(CSRF_COOKIE_NAME, createToken(), {
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
  })
}

export async function verifyCsrf(request: NextRequest): Promise<boolean> {
  if (!isSameOrigin(request)) return false

  const cookieToken = csrfCookieValue(request)
  if (!cookieToken) return false

  const requestToken = await tokenFromRequest(request)
  return requestToken === cookieToken
}

export function csrfForbiddenResponse(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
