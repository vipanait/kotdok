import { createApiClient, ApiError, type ApiClient } from '@lapka/shared'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { createRefreshCoordinator } from '@/lib/token-refresh'

/**
 * The API client the screens use.
 *
 * It takes the access token from the current session, and when the server says
 * the token is no longer valid it refreshes **once** for however many requests
 * failed together — see token-refresh.ts.
 */

let onSessionLost: () => void | Promise<void> = () => {}

/** Set by the auth provider, which owns signing out. */
export function setSessionLostHandler(handler: () => void | Promise<void>): void {
  onSessionLost = handler
}

const refresher = createRefreshCoordinator({
  refresh: async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) return { ok: false }
    return { ok: true, accessToken: data.session.access_token }
  },
  onSessionLost: () => onSessionLost(),
})

async function currentAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

const client = createApiClient({
  baseUrl: env.apiUrl,
  getAccessToken: currentAccessToken,
})

/**
 * Runs a call, and on `unauthorized` refreshes the session once and retries.
 * A second failure means the session is over, and the caller sees the error.
 */
export async function withFreshSession<T>(call: (api: ApiClient) => Promise<T>): Promise<T> {
  try {
    return await call(client)
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'unauthorized') throw error

    const token = await refresher.refreshOnce()
    if (!token) throw error

    return call(client)
  }
}

export { client as api }
