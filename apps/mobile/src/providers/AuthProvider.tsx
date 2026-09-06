import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sessionStorage, setSessionWriteFailureHandler, supabase } from '@/lib/supabase'
import { setSessionLostHandler } from '@/lib/api'
import { authRedirectUrl } from '@/lib/auth-links'

type AuthState = {
  session: Session | null
  /** True until the stored session has been read, so screens do not flash. */
  loading: boolean
  /** Set when the session ended for a reason worth telling the user about. */
  notice: string | null
  signIn(email: string, password: string): Promise<void>
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
