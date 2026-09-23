'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import ProviderButtons from '@/features/auth/ProviderButtons'
import { emailSignUpOptions } from '@/features/auth/lib/sign-up-options'
import { createClient } from '@/features/auth/lib/supabase-browser'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { DEFAULT_NEXT_PATH, getSafeNextPath } from '@/shared/security/safe-next'
import { PASSWORD_MIN } from '@/shared/security/password'

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

interface Props {
  mode: AuthMode
  /** The `next` query parameter as it arrived, unchecked; links between the forms carry it on. */
  next?: string
  /** The callback sent the person back here after a failed or cancelled sign-in. */
  callbackFailed?: boolean
}

/** Where to go after signing in, read and checked at the moment it is needed. */
function safeNext(): string {
  if (typeof window === 'undefined') return DEFAULT_NEXT_PATH
  return getSafeNextPath(new URLSearchParams(window.location.search).get('next'))
}

/** A link to another auth form that keeps the checked `next` destination. */
function withNext(path: string, next: string | undefined): string {
  if (!next) return path
  return `${path}?next=${encodeURIComponent(getSafeNextPath(next))}`
}

function registrationErrorMessage(
  error: { code?: string; message: string },
  t: Dictionary['auth']['register'],
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

/**
 * The form card of the auth pages: sign-in, sign-up, the reset request and
 * the new password, with their sent and error states.
 */
export default function AuthCard({ mode, next, callbackFailed = false }: Props) {
  switch (mode) {
    case 'login':
      return <LoginForm next={next} callbackFailed={callbackFailed} />
    case 'register':
      return <RegisterForm next={next} />
    case 'forgot':
      return <ForgotForm next={next} />
    case 'reset':
      return <ResetForm />
  }
}

/* ------------------------------ Login ------------------------------ */

function LoginForm({ next, callbackFailed }: { next?: string; callbackFailed: boolean }) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.auth.login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(callbackFailed ? t.errorCallback : '')
  const [loading, setLoading] = useState(false)
  const errorId = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setError(t.errorCredentials); setLoading(false); return }
    router.push(safeNext()); router.refresh()
  }

  const describedBy = error ? errorId : undefined

  return (
    <Card heading={t.heading}>
      <ErrorBanner id={errorId} text={error} />
      <form onSubmit={handleSubmit}>
        <EmailField value={email} onChange={setEmail} describedBy={describedBy} />
        <PasswordField
          label={dict.auth.password}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          describedBy={describedBy}
        />
        <SubmitButton loading={loading} label={t.submit} loadingLabel={t.submitting} />
      </form>
      <div className="auth-links">
        <Link className="link" href={withNext('/register', next)}>{t.createAccount}</Link>
        <Link className="link" href={withNext('/forgot-password', next)}>{t.forgotPassword}</Link>
      </div>
      <ProviderButtons next={safeNext} onError={setError} />
    </Card>
  )
}

/* ----------------------------- Register ----------------------------- */

function RegisterForm({ next }: { next?: string }) {
  const dict = useTranslations()
  const locale = useLocale()
  const t = dict.auth.register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTos, setAcceptedTos] = useState(false)
  const [tosError, setTosError] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const errorId = useId()
  const tosId = useId()
  const tosErrorId = useId()
  const hintId = useId()
  const tosRef = useRef<HTMLInputElement>(null)

  /** The terms cover email and every provider alike. */
  function requireTos(): boolean {
    if (acceptedTos) return true
    setTosError(true)
    tosRef.current?.focus()
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
      options: emailSignUpOptions(window.location.origin, safeNext(), locale),
    })
    if (error) { setError(registrationErrorMessage(error, t)); setLoading(false); return }
    setSentTo(trimmedEmail); setLoading(false)
  }

  if (sentTo !== null) {
    return (
      <SentCard
        banner={t.sentTo.replace('{email}', () => sentTo)}
        text={t.sentText}
        backHref={withNext('/login', next)}
      />
    )
  }

  const describedBy = error ? errorId : undefined

  return (
    <Card heading={t.heading}>
      <ErrorBanner id={errorId} text={error} />
      <form onSubmit={handleSubmit}>
        <EmailField value={email} onChange={setEmail} describedBy={describedBy} />
        <PasswordField
          label={dict.auth.password}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          hint={t.passwordHint}
          hintId={hintId}
          describedBy={describedBy}
        />
        <div className="auth-terms">
          <label className="terms" htmlFor={tosId}>
            <input
              ref={tosRef}
              id={tosId}
              type="checkbox"
              checked={acceptedTos}
              onChange={e => {
                setAcceptedTos(e.target.checked)
                if (e.target.checked) setTosError(false)
              }}
              aria-invalid={tosError || undefined}
              aria-describedby={tosError ? tosErrorId : undefined}
            />
            <span>
              {t.tosPrefix}{' '}
              <Link href="/legal" target="_blank" rel="noopener noreferrer">{t.tosLink}</Link>
            </span>
          </label>
          {tosError && (
            <p id={tosErrorId} className="field-error" role="alert">{t.errorTosRequired}</p>
          )}
        </div>
        <SubmitButton loading={loading} label={t.submit} loadingLabel={t.submitting} />
      </form>
      <div className="auth-links">
        <Link className="link" href={withNext('/login', next)}>{t.haveAccount}</Link>
      </div>
      <ProviderButtons next={safeNext} canStart={requireTos} onError={setError} />
    </Card>
  )
}

/* ----------------------------- Forgot ----------------------------- */

function ForgotForm({ next }: { next?: string }) {
  const dict = useTranslations()
  const t = dict.auth.forgotPassword
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const errorId = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const trimmedEmail = email.trim()
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    if (error) { setError(t.errorSend); setLoading(false); return }
    setSentTo(trimmedEmail); setLoading(false)
  }

  // Worded the same whether or not the address has an account.
  if (sentTo !== null) {
    return (
      <SentCard
        banner={t.sentTo.replace('{email}', () => sentTo)}
        text={t.sentText}
        backHref={withNext('/login', next)}
      />
    )
  }

  return (
    <Card heading={t.heading} sub={t.subheading}>
      <ErrorBanner id={errorId} text={error} />
      <form onSubmit={handleSubmit}>
        <EmailField value={email} onChange={setEmail} describedBy={error ? errorId : undefined} />
        <SubmitButton loading={loading} label={t.submit} loadingLabel={t.submitting} />
      </form>
      <div className="auth-links">
        <Link className="link" href={withNext('/login', next)}>{t.backToLogin}</Link>
      </div>
    </Card>
  )
}

/* ----------------------------- Reset ------------------------------ */

/**
 * Reached through the recovery link, which signs the person in; so there is
 * no way back to the sign-in form from here, which would only bounce to the
 * dashboard.
 */
function ResetForm() {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.auth.resetPassword
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const errorId = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < PASSWORD_MIN) { setError(t.errorTooShort); return }
    if (password !== confirm) { setError(t.errorMismatch); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(t.errorFailed); setLoading(false); return }
    router.push('/dashboard'); router.refresh()
  }

  const describedBy = error ? errorId : undefined

  return (
    <Card heading={t.heading} sub={t.subheading}>
      <ErrorBanner id={errorId} text={error} />
      <form onSubmit={handleSubmit}>
        <PasswordField
          label={t.newPassword}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          describedBy={describedBy}
        />
        <PasswordField
          label={t.confirmPassword}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          describedBy={describedBy}
        />
        <SubmitButton loading={loading} label={t.submit} loadingLabel={t.submitting} />
      </form>
    </Card>
  )
}

/* --------------------------- Shared UI ---------------------------- */

function Card({ heading, sub, children }: { heading: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card auth-card" aria-labelledby="auth-card-title">
      <h2 id="auth-card-title">{heading}</h2>
      {sub && <p className="auth-sub">{sub}</p>}
      {children}
    </section>
  )
}

/** A sent email: the card takes focus to its heading, so the change is announced. */
function SentCard({ banner, text, backHref }: { banner: string; text: string; backHref: string }) {
  const dict = useTranslations()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => { headingRef.current?.focus() }, [])

  return (
    <section className="card auth-card" aria-labelledby="auth-card-title">
      <h2 id="auth-card-title" ref={headingRef} tabIndex={-1}>{dict.auth.sent.heading}</h2>
      <div className="banner" role="status">{banner}</div>
      <p className="auth-sent-text">{text}</p>
      <Link className="btn primary" href={backHref}>{dict.auth.sent.backToLogin}</Link>
    </section>
  )
}

function ErrorBanner({ id, text }: { id: string; text: string }) {
  if (!text) return null
  return <div id={id} className="banner error" role="alert">{text}</div>
}

function EmailField({
  value,
  onChange,
  describedBy,
}: {
  value: string
  onChange: (v: string) => void
  describedBy?: string
}) {
  const dict = useTranslations()
  const id = useId()
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{dict.auth.email}</label>
      <input
        id={id}
        className="input"
        type="email"
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="email"
        aria-describedby={describedBy}
      />
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  hint,
  hintId,
  describedBy,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
  hint?: string
  hintId?: string
  describedBy?: string
}) {
  const dict = useTranslations()
  const id = useId()
  const [visible, setVisible] = useState(false)
  const described = [hint ? hintId : undefined, describedBy].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <span className="password-control">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-describedby={described}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? dict.common.hidePassword : dict.common.showPassword}
          aria-controls={id}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </span>
      {hint && <span id={hintId} className="field-hint">{hint}</span>}
    </div>
  )
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button type="submit" className="btn primary" disabled={loading}>
      {loading ? loadingLabel : label}
    </button>
  )
}
