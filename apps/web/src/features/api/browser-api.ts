import { createApiClient, type ApiClient, type FetchLike } from '@lapka/shared'
import { createClient } from '@/features/auth/lib/supabase-browser'

/**
 * The shared v1 API client, as a page in the browser uses it.
 *
 * /api/v1 accepts a Bearer token and never a cookie, so the token is read
 * from the site's own Supabase session — the same session the cabinet pages
 * are rendered for, refreshed by the Supabase client as it goes. Nothing is
 * stored here: no copy of the native app's token storage, no second session.
 * Signed out, no header is sent and the API answers 401.
 */
let client: ApiClient | null = null

const browserFetch: FetchLike = (url, init) =>
  fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal as AbortSignal | undefined,
    // A medical record is never served from the HTTP cache.
    cache: 'no-store',
    credentials: 'omit',
  })

export function browserApi(): ApiClient {
  if (client) return client
  const supabase = createClient()
  client = createApiClient({
    // Same origin: the page and the API are one site.
    baseUrl: '',
    fetch: browserFetch,
    getAccessToken: async () => {
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    },
  })
  return client
}
