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

function registrationErrorMessage(
  error: { code?: string; message: string },
  t: ReturnType<typeof useTranslations>['auth']['register'],
): string {
  switch (error.code) {
    case 'email_exists':
    case 'user_already_exists':
      return t.errorAlreadyRegistered
    case 'weak_password':
      return t.errorWeakPassword
    case 'email_address_invalid':
      return t.errorInvalidEmail
    case 'email_address_not_authorized':
      return t.errorEmailDelivery
    default:
      break
  }

  const normalized = error.message.toLowerCase()
  if (normalized.includes('already') || normalized.includes('registered')) return t.errorAlreadyRegistered
  if (normalized.includes('password')) return t.errorWeakPassword
  if (normalized.includes('invalid') && normalized.includes('email')) return t.errorInvalidEmail
  if (normalized.includes('not authorized') || normalized.includes('not allowed')) return t.errorEmailDelivery
  return t.errorGeneric
}

export default function AuthModal({ initialMode }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!open) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  function close() {
    setOpen(false)
    router.replace('/')
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

  if (!open) return null

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
          {mode === 'login' && <LoginPanel onSwitch={switchMode} onNavigate={() => setOpen(false)} />}
          {mode === 'register' && <RegisterPanel onSwitch={switchMode} />}
          {mode === 'forgot' && <ForgotPanel onSwitch={switchMode} />}
          {mode === 'reset' && <ResetPanel onNavigate={() => setOpen(false)} />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Login ------------------------------ */

function LoginPanel({
  onSwitch,
  onNavigate,
}: {
  onSwitch: (m: AuthMode) => void
  onNavigate: () => void
}) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.auth.login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [yandexLoading, setYandexLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const trimmedEmail = email.trim()
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
    if (error) { setError(t.errorCredentials); setLoading(false); return }
    onNavigate()
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

  async function handleYandex() {
    setYandexLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:yandex',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}` },
    })
    if (error) { setError(t.errorYandex); setYandexLoading(false) }
  }

  return (
    <>
      <ModalHeader heading={t.heading} subheading={t.subheading} />
      <div className="space-y-4">
        {error && <ErrorBox text={error} />}
        <div className="space-y-2">
          <YandexButton onClick={handleYandex} loading={yandexLoading} label={t.yandexBtn} />
          <GoogleButton onClick={handleGoogle} loading={googleLoading} label={t.googleBtn} />
        </div>
        <Divider text={dict.common.or} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldEmail value={email} onChange={setEmail} />
          <div>
            <PasswordInput
              label={t.password}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              action={(
                <button type="button" onClick={() => onSwitch('forgot')} className="text-xs text-accent hover:underline">
                  {t.forgotPassword}
                </button>
              )}
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
  const [acceptedTos, setAcceptedTos] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [yandexLoading, setYandexLoading] = useState(false)

  function requireTos(): boolean {
    if (acceptedTos) return true
    setError(t.errorTosRequired)
    return false
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!requireTos()) return
    setLoading(true); setError('')
    const trimmedEmail = email.trim()
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: trimmedEmail, password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}`,
      },
    })
    if (error) { setError(registrationErrorMessage(error, t)); setLoading(false); return }
    setEmail(trimmedEmail)
    setSent(true); setLoading(false)
  }

  async function handleGoogle() {
    if (!requireTos()) return
    setGoogleLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}` },
    })
    if (error) { setError(t.errorGoogle); setGoogleLoading(false) }
  }

  async function handleYandex() {
    if (!requireTos()) return
    setYandexLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:yandex',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}` },
    })
    if (error) { setError(t.errorYandex); setYandexLoading(false) }
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
        <label className="flex items-start gap-2.5 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={acceptedTos}
            onChange={e => {
              setAcceptedTos(e.target.checked)
              if (e.target.checked) setError('')
            }}
            className="mt-1 h-4 w-4 shrink-0 rounded border-hairline accent-[var(--color-accent)]"
          />
          <span>
            {t.tosPrefix}{' '}
            <Link href="/legal" className="underline hover:text-text/70" target="_blank" rel="noopener noreferrer">
              {t.tosLink}
            </Link>
          </span>
        </label>
        <div className="space-y-2">
          <YandexButton onClick={handleYandex} loading={yandexLoading} label={t.yandexBtn} />
          <GoogleButton onClick={handleGoogle} loading={googleLoading} label={t.googleBtn} />
        </div>
        <Divider text={dict.common.or} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldEmail value={email} onChange={setEmail} />
          <div>
            <PasswordInput
              label={dict.auth.login.password}
              value={password}
              onChange={setPassword}
              minLength={6}
              autoComplete="new-password"
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
    const trimmedEmail = email.trim()
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
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

function ResetPanel({ onNavigate }: { onNavigate: () => void }) {
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
    onNavigate()
    router.push('/dashboard'); router.refresh()
  }

  return (
    <>
      <ModalHeader heading={t.heading} subheading={t.subheading} />
      <div className="space-y-4">
        {error && <ErrorBox text={error} />}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <PasswordInput
              label={t.newPassword}
              value={password}
              onChange={setPassword}
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div>
            <PasswordInput
              label={t.confirmPassword}
              value={confirm}
              onChange={setConfirm}
              minLength={6}
              autoComplete="new-password"
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
      <h2 className="font-extrabold text-2xl sm:text-3xl text-text">{heading}</h2>
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

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  action,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  minLength?: number
  action?: React.ReactNode
}) {
  const dict = useTranslations()
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-text">{label}</label>
        {action}
      </div>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${inputCls} pr-28`}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute inset-y-0 right-3 text-xs font-medium text-text-muted hover:text-text"
          aria-label={visible ? dict.common.hidePassword : dict.common.showPassword}
        >
          {visible ? dict.common.hidePassword : dict.common.showPassword}
        </button>
      </div>
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

function OAuthButton({
  onClick,
  loading,
  label,
  icon,
}: {
  onClick: () => void
  loading: boolean
  label: string
  icon: React.ReactNode
}) {
  const dict = useTranslations()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-hairline px-4 py-3 text-sm font-medium text-text hover:bg-canvas-soft transition-colors disabled:opacity-50"
    >
      {icon}
      {loading ? dict.common.redirecting : label}
    </button>
  )
}

function GoogleButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return <OAuthButton onClick={onClick} loading={loading} label={label} icon={<GoogleIcon />} />
}

function YandexButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return <OAuthButton onClick={onClick} loading={loading} label={label} icon={<YandexIcon />} />
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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function YandexIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#FC3F1D" />
      <path
        d="M13.32 18.5h-2.16v-5.52L7.5 5.5h2.4l2.28 5.52L14.52 5.5h2.28l-3.48 7.48V18.5z"
        fill="#fff"
      />
    </svg>
  )
}
