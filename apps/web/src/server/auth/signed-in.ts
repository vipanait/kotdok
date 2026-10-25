import 'server-only'

import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Whether somebody is signed in, for a public page that only chooses between
 * «Войти» and «Кабинет» by it.
 *
 * Answered from the session cookie's own token, checked against the project's
 * published signing keys (`getClaims`; the projects sign with ES256, so the
 * keys are fetched once and the check is local). `getUser()` would ask Auth
 * over the network — the proxy has already done that for this request. Who
 * the caller is, for anything that acts on their behalf, still comes from
 * `getAuthUser`. Once per request.
 */
export const isSignedIn = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )
  const { data, error } = await supabase.auth.getClaims()
  return !error && Boolean(data?.claims)
})
