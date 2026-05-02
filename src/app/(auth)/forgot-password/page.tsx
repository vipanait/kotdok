'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AuthShell from '@/components/AuthShell'
import { useTranslations } from '@/components/LocaleProvider'

export default function ForgotPasswordPage() {
  const dict = useTranslations()
  const t = dict.auth.forgotPassword

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setError(t.errorSend)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <AuthShell
      heading={sent ? t.headingSent : t.heading}
      subheading={sent ? t.subheadingSent : t.subheading}
      topRight={
        <span>
          {t.remembered}{' '}
          <Link href="/login" className="text-[#FC7A00] hover:underline">{t.signIn}</Link>
        </span>
      }
      footer={
        <>
          {t.noAccount}{' '}
          <Link href="/register" className="text-[#FC7A00] hover:underline font-medium">
            {t.registerLink}
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-3 py-2 text-center">
          <div className="text-4xl">📬</div>
          <p className="text-sm text-gray-700">
            {t.sentTo} <span className="font-medium">{email}</span>
          </p>
          <Link
            href="/login"
            className="inline-block bg-[#FC7A00] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#e36c00] transition-colors mt-2"
          >
            {t.backToLogin}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FC7A00]/40"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#FC7A00] py-3 text-sm font-semibold text-white hover:bg-[#e36c00] transition-colors disabled:opacity-50"
            >
              {loading ? t.submitting : t.submit}
            </button>
          </form>
        </div>
      )}
    </AuthShell>
  )
}
