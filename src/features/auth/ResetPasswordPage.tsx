'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/features/auth/lib/supabase-browser'
import AuthShell from '@/components/AuthShell'
import { useTranslations } from '@/components/LocaleProvider'

export default function ResetPasswordPage() {
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

    if (password.length < 6) {
      setError(t.errorTooShort)
      return
    }
    if (password !== confirm) {
      setError(t.errorMismatch)
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(t.errorFailed)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AuthShell
      heading={t.heading}
      subheading={t.subheading}
      topRight={
        <span>
          <Link href="/login" className="text-[#FC7A00] hover:underline">
            {dict.auth.login.submit}
          </Link>
        </span>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t.newPassword}</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FC7A00]/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t.confirmPassword}</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
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
    </AuthShell>
  )
}
