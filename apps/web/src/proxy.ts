import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, locales, type Locale } from '@/shared/i18n/config'
import { ensureCsrfCookie } from '@/server/security/csrf'
import { buildContentSecurityPolicy } from '@/server/security/csp'
import { PAGE_PATH_HEADER, pagePathOf } from '@/server/security/page-path'

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
  // The page asked for, for the pet gate's way back after sign-in or consent
  // (a layout is not given it). Set here, over anything the client sent.
  requestHeaders.set(PAGE_PATH_HEADER, pagePathOf(request.nextUrl))

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

  // The proxy runs in the Vercel region nearest the visitor, not next to
  // Supabase, so a call to Auth here costs a round trip across the world on
  // every page. The session token is checked locally instead (`getClaims`:
  // ES256, keys cached per instance; it still refreshes an expired session).
  // That only gates the page: every cabinet page asks Auth who the caller is
  // itself (`requireCabinet`, `loadAdminUser`). The way out of sign-in still
  // asks Auth: on a token whose session was revoked, /login → /dashboard →
  // /login would loop until the token expired.
  const path = request.nextUrl.pathname
  const isSignInPage = path === '/login' || path === '/register'

  if (isSignInPage) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return withCsp(NextResponse.redirect(new URL('/dashboard', request.url)), csp)
    return withCsp(supabaseResponse, csp)
  }

  const protectedPaths = ['/dashboard', '/cats', '/pets', '/check', '/credits', '/admin', '/consent']
  const isProtected = protectedPaths.some(p => path.startsWith(p))
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims?.claims && isProtected) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${path}${request.nextUrl.search}`)
    return withCsp(NextResponse.redirect(loginUrl), csp)
  }

  return withCsp(supabaseResponse, csp)
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  // Every match reads the session (and on /login and /register asks Auth over
  // the network), so only pages are matched. Left out: the API; the metadata routes (robots,
  // sitemap, manifest, icons, the social images); everything served from
  // `public/`; the OAuth return, which makes its own client; and the static
  // articles (`CONTENT_SEGMENTS`), the same for everybody and given their
  // policy by next.config.ts. `tests/server/security/proxy-matcher.test.ts`
  // and `content-paths.test.ts` hold the list to this.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|auth/callback(?:/|$)|robots\\.txt$|sitemap\\.xml$|manifest\\.webmanifest$|icon\\.svg$|apple-icon\\.png$|opengraph-image|twitter-image|web-app-manifest-|images/|yandex_[0-9a-f]+\\.html$|(?:simptomy|otravlenie|o-materialah)(?:/|$)).*)',
  ],
}
