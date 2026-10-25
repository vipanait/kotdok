'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import SignOutForm from '@/features/auth/SignOutForm'
import ConsentCheckbox, { ConsentTerms } from '@/features/consent/ConsentCheckbox'
import { browserApi } from '@/features/api/browser-api'

/**
 * The consent a new account still owes — signed up through a provider from the
 * sign-in page, or a new edition of the text. Leaving is always possible:
 * signing out, or deleting the account without ever consenting.
 */
export default function ConsentForm({ next }: { next: string }) {
  const router = useRouter()
  const t = useTranslations().consent
  const [checked, setChecked] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const checkboxRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!checked) {
      setInvalid(true)
      checkboxRef.current?.focus()
      return
    }

    setLoading(true); setError('')
    try {
      // Consent given here is from the web; the same call the apps make.
      await browserApi().giveConsent({ version: PD_CONSENT_VERSION, source: 'web' })
    } catch (error) {
      // The session ran out while the page was open: sign in again and come back.
      if (error instanceof ApiError && error.code === 'unauthorized') {
        router.replace(`/login?next=${encodeURIComponent(`/consent?next=${encodeURIComponent(next)}`)}`)
        return
      }
      setError(t.errorFailed); setLoading(false); return
    }
    router.replace(next); router.refresh()
  }

  return (
    <section className="card auth-card" aria-labelledby="consent-title">
      <h2 id="consent-title">{t.title}</h2>
      <p className="auth-sub">{t.lead}</p>
      {error && <div className="banner error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <ConsentCheckbox
          checked={checked}
          onChange={value => {
            setChecked(value)
            if (value) setInvalid(false)
          }}
          invalid={invalid}
          inputRef={checkboxRef}
        />
        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? t.submitting : t.submit}
        </button>
      </form>
      <ConsentTerms />
      <div className="auth-links">
        <SignOutForm label={t.signOut} />
        <Link className="link" href="/account-deletion">{t.deleteAccount}</Link>
      </div>
    </section>
  )
}
