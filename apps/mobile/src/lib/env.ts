/**
 * Configuration the app is built with.
 *
 * Read once and checked here, so a missing value fails at startup with a clear
 * message rather than as `undefined` inside a network call. Only EXPO_PUBLIC_*
 * values exist on the client: anything secret stays on the server.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set; check the app's .env`)
  return value
}

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  apiUrl: required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL),
} as const
