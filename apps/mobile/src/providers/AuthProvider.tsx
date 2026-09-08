import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import * as WebBrowser from 'expo-web-browser'
import { sessionStorage, setSessionWriteFailureHandler, supabase } from '@/lib/supabase'
import { setSessionLostHandler } from '@/lib/api'
import { authRedirectUrl } from '@/lib/auth-links'
import {
  createProviderSignIn,
  type ProviderId,
  type ProviderOutcome,
} from '@/lib/provider-sign-in'

/**
 * The provider sign-in with its real browser and real client.
 *
 * Built once, outside the component: it holds no state of its own, and the
 * pieces it needs are module-level too.
 */
const signInWithProvider = createProviderSignIn({
  async authorize(provider, redirectUrl) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      // `skipBrowserRedirect` leaves the opening to us, which is how a closed
      // browser becomes knowable. Supabase still stores the PKCE verifier here,
      // so the exchange later has something to prove the code is ours.
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    })
    return { url: data?.url ?? null, error }
  },
  openBrowser: (url, redirectUrl) => WebBrowser.openAuthSessionAsync(url, redirectUrl),
  async exchangeCode(code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return { error }
  },
  reportRefusal(code, description) {
    // Development only: on a phone there is no other place to read what the
    // provider objected to, and the user's banner deliberately does not say.
    if (__DEV__) console.warn(`Provider refused the sign-in: ${code}`, description)
  },
})

type AuthState = {
  session: Session | null
  /** True until the stored session has been read, so screens do not flash. */
  loading: boolean
  /** Set when the session ended for a reason worth telling the user about. */
  notice: string | null
  signIn(email: string, password: string): Promise<void>
  /**
   * Google or Yandex ID through the system browser. Returns what happened, so
   * the screen can tell a cancellation apart from a failure instead of guessing
   * from the absence of a session.
   */
  signInWithProvider(provider: ProviderId): Promise<ProviderOutcome>
  /**
   * Registers the address. Whether a session comes back is the project's
   * decision, not the app's: with confirmation required Supabase withholds it
   * until the address is verified, and without it the user is signed in at
   * once. The caller is told which happened instead of guessing.
   */
  signUp(email: string, password: string): Promise<{ confirmationRequired: boolean }>
  requestPasswordReset(email: string): Promise<void>
  signOut(): Promise<void>
  dismissNotice(): void
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth used outside AuthProvider')
  return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * Ends the session and removes everything belonging to it. Used both for a
   * deliberate sign-out and for the cases where continuing would leave the app
   * pretending to be signed in.
   */
  const endSession = useCallback(async (reason: string | null) => {
    await supabase.auth.signOut().catch(() => {})
    await sessionStorage.clearAll()
    setSession(null)
    setNotice(reason)
  }, [])

  useEffect(() => {
    // A session that cannot be written down disappears on the next launch. Ending
    // it now, with an explanation, beats letting the user discover that later.
    setSessionWriteFailureHandler(() => {
      void endSession('Не удалось сохранить вход на этом устройстве. Войдите ещё раз.')
    })
    setSessionLostHandler(() => endSession('Сессия истекла. Войдите ещё раз.'))
  }, [endSession])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      notice,
      dismissNotice: () => setNotice(null),

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },

      signInWithProvider,

      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Built by the app, never taken from input, so a crafted link cannot
          // redirect the confirmation somewhere else.
          options: { emailRedirectTo: authRedirectUrl('verify') },
        })
        if (error) throw error
        return { confirmationRequired: data.session === null }
      },

      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authRedirectUrl('recover'),
        })
        if (error) throw error
      },

      signOut: () => endSession(null),
    }),
    [session, loading, notice, endSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
