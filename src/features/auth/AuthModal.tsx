'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/features/auth/lib/supabase-browser'
import { useTranslations } from '@/components/LocaleProvider'

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

interface Props {
  initialMode: AuthMode
}

function safeNext(): string {
  if (typeof window === 'undefined') return '/dashboard'
  const next = new URLSearchParams(window.location.search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  return next
}

const ROUTE_FOR_MODE: Record<AuthMode, string> = {
  login: '/login',
  register: '/register',
  forgot: '/forgot-password',
  reset: '/reset-password',
}

export default function AuthModal({ initialMode }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const [mode, setMode] = useState<AuthMode>(initialMode)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function close() {
    router.push('/')
  }

  function switchMode(next: AuthMode) {
    setMode(next)
    // Keep URL in sync so back button works and reload preserves the modal state.
    window.history.replaceState(null, '', ROUTE_FOR_MODE[next])
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div className="bg-card rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[95dvh] overflow-y-auto relative">
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 z-10 text-text/70 hover:text-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-xl leading-none"
          aria-label={dict.common.close}
        >
          ×
        </button>
        <div className="p-6 sm:p-8">
          {mode === 'login' && <LoginPanel onSwitch={switchMode} />}
          {mode === 'register' && <RegisterPanel onSwitch={switchMode} />}
          {mode === 'forgot' && <ForgotPanel onSwitch={switchMode} />}
          {mode === 'reset' && <ResetPanel />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Login ------------------------------ */

function LoginPanel({ onSwitch }: { onSwitch: (m: AuthMode) => void }) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.auth.login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(t.errorCredentials); setLoading(false); return }
    router.push(safeNext()); router.refresh()
  }

  async function handleGoogle() {
    setGoogleLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}` },
    })
    if (error) { setError(t.errorGoogle); setGoogleLoading(false) }
  }

  return (
    <>
      <ModalHeader heading={t.heading} subheading={t.subheading} />
      <div className="space-y-4">
        {error && <ErrorBox text={error} />}
        <GoogleButton onClick={handleGoogle} loading={googleLoading} label={t.googleBtn} />
        <Divider text={dict.common.or} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldEmail value={email} onChange={setEmail} />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-text">{t.password}</label>
              <button type="button" onClick={() => onSwitch('forgot')} className="text-xs text-accent hover:underline">
                {t.forgotPassword}
              </button>
            </div>
            <input
              type="password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className={inputCls}
            />
          </div>
          <PrimaryButton loading={loading} loadingLabel={t.submitting} label={t.submit} />
        </form>
      </div>
      <FooterLine>
        {t.noAccount}{' '}
        <button type="button" onClick={() => onSwitch('register')} className="text-accent hover:underline font-medium">
          {t.register}
        </button>
      </FooterLine>
    </>
  )
}

/* ----------------------------- Register ----------------------------- */

function RegisterPanel({ onSwitch }: { onSwitch: (m: AuthMode) => void }) {
  const dict = useTranslations()
  const t = dict.auth.register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}`,
      },
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSent(true); setLoading(false)
  }

  async function handleGoogle() {
    setGoogleLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}` },
    })
    if (error) { setError(t.errorGoogle); setGoogleLoading(false) }
  }

  if (sent) {
    return (
      <>
        <ModalHeader heading={t.headingSent} subheading={t.subheadingSent} />
        <div className="space-y-3 py-2 text-center">
          <div className="text-4xl">📬</div>
          <p className="text-sm text-text">
            {t.sentTo} <span className="font-medium">{email}</span>
          </p>
          <p className="text-xs text-text-faint">{t.checkInboxHint}</p>
          <button
            type="button"
            onClick={() => onSwitch('login')}
            className="inline-block bg-accent text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-accent-hover transition-colors mt-2"
          >
            {t.backToLogin}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <ModalHeader heading={t.heading} subheading={t.subheading} />
      <div className="space-y-4">
        {error && <ErrorBox text={error} />}
        <GoogleButton onClick={handleGoogle} loading={googleLoading} label={t.googleBtn} />
        <Divider text={dict.common.or} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldEmail value={email} onChange={setEmail} />
          <div>
            <label className="mb-1 block text-sm font-medium text-text">{dict.auth.login.password}</label>
            <input
              type="password" required minLength={6}
              value={password} onChange={e => setPassword(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-text-faint">{t.passwordHint}</p>
          </div>
          <PrimaryButton loading={loading} loadingLabel={t.submitting} label={t.submit} />
        </form>
      </div>
      <FooterLine>
        {t.alreadyMember}{' '}
        <button type="button" onClick={() => onSwitch('login')} className="text-accent hover:underline font-medium">
          {t.signIn}
        </button>
        <span className="block mt-2 text-xs text-text-faint">
          {t.tosPrefix}{' '}
          <Link href="/legal" className="underline hover:text-text/70">{t.tosLink}</Link>
        </span>
      </FooterLine>
    </>
  )
}

/* ----------------------------- Forgot ----------------------------- */

function ForgotPanel({ onSwitch }: { onSwitch: (m: AuthMode) => void }) {
  const dict = useTranslations()
  const t = dict.auth.forgotPassword
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    if (error) { setError(t.errorSend); setLoading(false); return }
    setSent(true); setLoading(false)
  }

  if (sent) {
    return (
      <>
        <ModalHeader heading={t.headingSent} subheading={t.subheadingSent} />
        <div className="space-y-3 py-2 text-center">
          <div className="text-4xl">📬</div>
          <p className="text-sm text-text">
            {t.sentTo} <span className="font-medium">{email}</span>
          </p>
          <button
            type="button"
            onClick={() => onSwitch('login')}
            className="inline-block bg-accent text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-accent-hover transition-colors mt-2"
          >
            {t.backToLogin}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <ModalHeader heading={t.heading} subheading={t.subheading} />
      <div className="space-y-4">
        {error && <ErrorBox text={error} />}
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldEmail value={email} onChange={setEmail} />
          <PrimaryButton loading={loading} loadingLabel={t.submitting} label={t.submit} />
        </form>
      </div>
      <FooterLine>
        {t.remembered}{' '}
        <button type="button" onClick={() => onSwitch('login')} className="text-accent hover:underline font-medium">
          {t.signIn}
        </button>
      </FooterLine>
    </>
  )
}

/* ----------------------------- Reset ------------------------------ */

function ResetPanel() {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.auth.resetPassword
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError(t.errorTooShort); return }
    if (password !== confirm) { setError(t.errorMismatch); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(t.errorFailed); setLoading(false); return }
    router.push('/dashboard'); router.refresh()
  }

  return (
    <>
      <ModalHeader heading={t.heading} subheading={t.subheading} />
      <div className="space-y-4">
        {error && <ErrorBox text={error} />}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text">{t.newPassword}</label>
            <input
              type="password" required minLength={6}
              value={password} onChange={e => setPassword(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text">{t.confirmPassword}</label>
            <input
              type="password" required minLength={6}
              value={confirm} onChange={e => setConfirm(e.target.value)}
              className={inputCls}
            />
          </div>
          <PrimaryButton loading={loading} loadingLabel={t.submitting} label={t.submit} />
        </form>
      </div>
    </>
  )
}

/* --------------------------- Shared UI ---------------------------- */

const inputCls =
  'w-full rounded-xl border border-hairline bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'

function ModalHeader({ heading, subheading }: { heading: string; subheading?: string }) {
  return (
    <div className="mb-5 pr-10">
      <h2 className="font-serif text-2xl sm:text-3xl font-bold text-text">{heading}</h2>
      {subheading && <p className="mt-2 text-sm text-text-muted">{subheading}</p>}
    </div>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error-fg">{text}</div>
  )
}

function FieldEmail({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text">Email</label>
      <input
        type="email" required
        value={value} onChange={e => onChange(e.target.value)}
        className={inputCls}
        autoComplete="email"
      />
    </div>
  )
}

function PrimaryButton({ loading, loadingLabel, label }: { loading: boolean; loadingLabel: string; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
    >
      {loading ? loadingLabel : label}
    </button>
  )
}

function GoogleButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  const dict = useTranslations()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-hairline px-4 py-3 text-sm font-medium text-text hover:bg-canvas-soft transition-colors disabled:opacity-50"
    >
      <GoogleIcon />
      {loading ? dict.common.redirecting : label}
    </button>
  )
}

function Divider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-hairline" />
      <span className="text-xs text-text-faint">{text}</span>
      <div className="h-px flex-1 bg-hairline" />
    </div>
  )
}

function FooterLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 text-center text-sm text-text-muted">
      {children}
    </p>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
