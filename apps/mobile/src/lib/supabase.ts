import 'react-native-url-polyfill/auto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { env } from '@/lib/env'
import { createSessionStorage, type SessionStorage } from '@/lib/session-storage'

/**
 * The Supabase client and the storage behind it.
 *
 * The session lives in the keychain rather than in plain storage, and a failed
 * write is surfaced instead of swallowed — see session-storage.ts for why that
 * matters on a phone.
 */

let onWriteFailure: (error: Error) => void = () => {}

/** Set by the auth provider, which knows how to sign out and clear state. */
export function setSessionWriteFailureHandler(handler: (error: Error) => void): void {
  onWriteFailure = handler
}

export const sessionStorage: SessionStorage = createSessionStorage({
  storage: SecureStore,
  onWriteFailure: (error: Error) => onWriteFailure(error),
})

export const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // The app handles links itself and accepts only its own scheme, so the
    // client must not try to read a session out of whatever URL opened it.
    detectSessionInUrl: false,
    // Ask for the flow that keeps tokens out of the link: the email carries a
    // code, and the session is fetched over TLS against a verifier this device
    // kept to itself. The default is the implicit flow, which puts the session
    // in the URL fragment for anything that can read the link to take.
    flowType: 'pkce',
  },
})
