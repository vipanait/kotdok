'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
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
      setError('Не удалось отправить письмо. Проверьте email и попробуйте снова.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold">🐱 КотДок</Link>
          <h1 className="text-xl font-semibold text-gray-900 mt-4">Восстановление пароля</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {sent ? (
            <div className="text-center space-y-3 py-2">
              <div className="text-4xl">📬</div>
              <p className="text-sm text-gray-700">
                Письмо отправлено на <span className="font-medium">{email}</span>
              </p>
              <p className="text-sm text-gray-500">
                Перейдите по ссылке в письме, чтобы задать новый пароль.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
              )}
              <p className="text-sm text-gray-500">
                Введите email вашего аккаунта — мы пришлём ссылку для сброса пароля.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-500 text-white py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Отправляем...' : 'Отправить ссылку'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          <Link href="/login" className="text-orange-500 hover:underline">Вернуться ко входу</Link>
        </p>
      </div>
    </div>
  )
}
