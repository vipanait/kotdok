/**
 * Configuration the app is built with.
 *
 * Read once and checked here, so a missing value fails at startup with a clear
 * message rather than as `undefined` inside a network call. Only EXPO_PUBLIC_*
 * values exist on the client: anything secret stays on the server.
 *
 * A build that ships also has to use https everywhere — see config-url.ts.
 */

import { configuredUrl } from '@/lib/config-url'

// `__DEV__` is false in every build that leaves a developer's machine, and
// undefined outside the app (tests, tooling), where the stricter rule is right.
const options = { release: typeof __DEV__ === 'undefined' || !__DEV__ }

export const env = {
  supabaseUrl: configuredUrl(
    'EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL, options,
  ),
  supabaseAnonKey: (() => {
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    if (!key) throw new Error("EXPO_PUBLIC_SUPABASE_ANON_KEY is not set; check the app's .env")
    return key
  })(),
  apiUrl: configuredUrl('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL, options),
} as const
