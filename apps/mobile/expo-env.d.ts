/// <reference types="expo/types" />

/**
 * Configuration the bundler inlines at build time. Only EXPO_PUBLIC_* values
 * reach the client, which is why nothing secret is declared here.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string
    EXPO_PUBLIC_API_URL?: string
  }
}
