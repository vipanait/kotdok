import 'react-native-url-polyfill/auto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { env } from '@/lib/env'
import { createSessionStorage, type SessionStorage } from '@/lib/session-storage'
import { installWebCrypto } from '@/lib/webcrypto'

// Before the client exists: it decides how to build and hash the PKCE verifier
// the first time it is asked, and warns about the weaker path rather than
// failing, so a late install would go unnoticed.
installWebCrypto(globalThis, {
  digest: (_algorithm, data) =>
    Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data as BufferSource),
  getRandomValues: (array) => Crypto.getRandomValues(array as never),
})

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

/**
 * Somewhere to keep a half-written check.
 *
 * Its own instance, deliberately: a session that cannot be written down has to
 * end the session, but a draft that cannot be written down is only a lost
 * draft. Sharing the handler would sign people out over a saved note.
 *
 * The keychain rather than plain storage because a draft describes an animal's
 * symptoms, and that belongs to the person who typed it.
 */
export const draftStorage: SessionStorage = createSessionStorage({
  storage: SecureStore,
  onWriteFailure: () => {},
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
