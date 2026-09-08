/**
 * Configuration the bundler inlines at build time. Only EXPO_PUBLIC_* values
 * reach the client, which is why nothing secret is declared here.
 *
 * This lives under `src/` rather than in the project root: Expo owns the root
 * `expo-env.d.ts` and deletes it on every prebuild, which took these
 * declarations with it twice.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string
    EXPO_PUBLIC_API_URL?: string
  }
}
