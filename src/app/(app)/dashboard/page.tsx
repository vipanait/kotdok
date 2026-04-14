import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { URGENCY_EMOJI } from '@/lib/urgency'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [{ data: profile }, { data: checks }, { data: cats }] = await Promise.all([
    service.from('profiles').select('credits, plan').eq('id', user.id).single(),
    service
      .from('symptom_checks')
      .select('id, symptoms_input, urgency, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    service
      .from('cats')
      .select('id, name, breed, age_years, sex')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ])

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <span className="text-2xl font-bold">🐱 КотДок</span>
        <form action="/api/auth/signout" method="post">
          <button className="text-sm text-gray-500 hover:text-gray-700">Выйти</button>
        </form>
      </div>

      {/* Credits */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Доступно проверок</div>
            <div className="text-4xl font-bold text-gray-900">{profile?.credits ?? 0}</div>
          </div>
          <Link
            href="/check"
            className="bg-orange-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors"
          >
            Проверить симптомы
          </Link>
        </div>
        {(profile?.credits ?? 0) === 0 && (
          <div className="mt-4 text-sm text-orange-700 bg-orange-50 rounded-lg px-4 py-3">
            Credits закончились.{' '}
            <Link href="/pricing" className="underline font-medium">Пополнить</Link>
          </div>
        )}
      </div>

      {/* Мои коты */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Мои коты</h2>
          <Link href="/cats/new" className="text-sm text-orange-500 hover:text-orange-600 font-medium">+ Добавить</Link>
        </div>
        {!cats?.length ? (
          <p className="text-sm text-gray-500">Добавьте профиль кота — это улучшит точность анализа симптомов.</p>
        ) : (
          <ul className="space-y-2">
            {cats.map((cat: { id: string; name: string; breed: string | null; age_years: number | null; sex: string | null }) => (
              <li key={cat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.sex === 'male' ? '🐱' : '🐈'}</span>
                  <div>
                    <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                    {(cat.breed || cat.age_years) && (
                      <span className="text-xs text-gray-400 ml-2">
                        {[cat.breed, cat.age_years ? `${cat.age_years} лет` : null].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <Link href={`/cats/${cat.id}/edit`} className="text-xs text-gray-400 hover:text-gray-600">Изменить</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* История */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">История проверок</h2>
        {!checks?.length ? (
          <p className="text-sm text-gray-500">Проверок пока нет. Опишите симптомы кошки — получите ответ за 15 секунд.</p>
        ) : (
          <ul className="space-y-3">
            {checks.map((check: { id: string; symptoms_input: string; urgency: string; created_at: string }) => (
              <li key={check.id}>
                <Link href={`/check/${check.id}`} className="flex gap-3 items-start border-b border-gray-50 pb-3 last:border-0 last:pb-0 hover:bg-gray-50 rounded-lg px-2 py-1 -mx-2 transition-colors">
                  <span className="text-xl shrink-0">{URGENCY_EMOJI[check.urgency] ?? '⚪'}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 line-clamp-2">{check.symptoms_input}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(check.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-center text-xs text-gray-400 mt-6">
        <Link href="/legal" className="hover:underline">Пользовательское соглашение</Link>
      </p>
    </div>
  )
}
