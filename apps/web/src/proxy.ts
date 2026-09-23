import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, locales, type Locale } from '@/shared/i18n/config'
import { ensureCsrfCookie } from '@/server/security/csrf'
import { buildContentSecurityPolicy } from '@/server/security/csp'

function detectLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get('NEXT_LOCALE')?.value
  if (cookie && (locales as readonly string[]).includes(cookie)) return cookie as Locale

  return defaultLocale
}

export async function proxy(request: NextRequest) {
  // One nonce per response: Next stamps it onto its own scripts, and nothing
  // else in the page can carry a value it cannot predict.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseOrigin: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin,
    dev: process.env.NODE_ENV === 'development',
  })

  // Next reads the policy off the request to find the nonce while rendering.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const locale = detectLocale(request)
  if (!request.cookies.get('NEXT_LOCALE')) {
    supabaseResponse.cookies.set('NEXT_LOCALE', locale, { path: '/', sameSite: 'lax' })
  }
  ensureCsrfCookie(request, supabaseResponse)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          ensureCsrfCookie(request, supabaseResponse)
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const protectedPaths = ['/dashboard', '/cats', '/pets', '/check', '/credits', '/admin']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (!user && isProtected) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return withCsp(NextResponse.redirect(loginUrl), csp)
  }

  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register')) {
    return withCsp(NextResponse.redirect(new URL('/dashboard', request.url)), csp)
  }

  return withCsp(supabaseResponse, csp)
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
