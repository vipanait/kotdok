import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

/**
 * The signed-in user *and* the token they arrived with.
 *
 * `getAuthUser` is enough almost everywhere: who is calling is all a route
 * needs. Re-authentication needs one thing more — when they last actually
 * authenticated — and that lives in the token's `amr` claim rather than on the
 * user.
 *
 * The order matters and is not an accident. `getUser()` goes to Supabase and
 * verifies; only then is the token read out of the cookie store. Reading a
 * claim from a token somebody else has verified is safe, and reading one from
 * an unverified token is how sessions get forged, so the two must not be
 * confused.
 */
export async function getAuthSession(): Promise<{ user: User; accessToken: string } | null> {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null

  return { user, accessToken: session.access_token }
}
