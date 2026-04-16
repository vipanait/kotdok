import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { URGENCY_CONFIG } from '@/lib/urgency'
import type { UrgencyKey } from '@/lib/urgency'
import { APPETITE_LABELS, ACTIVITY_LABELS, DURATION_LABELS, STOOL_LABELS } from '@/lib/check-params'

export default async function CheckResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: check } = await service
    .from('symptom_checks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!check) notFound()

  const full = check.full_response as Record<string, unknown> | null
  const urgencyKey = check.urgency as UrgencyKey
  const urgency = URGENCY_CONFIG[urgencyKey]

  const possibleCauses: string[] = Array.isArray(check.possible_causes) ? check.possible_causes : []
  const homeCareSteps: string[] = Array.isArray(check.home_care_steps) ? check.home_care_steps : []
  const vetQuestions: string[] = Array.isArray(check.vet_questions) ? check.vet_questions : []
  const photoObservations = (full?.photo_observations as string | null) ?? null
  const hasPhoto = !!(full?.has_photo)
  const disclaimer = (full?.disclaimer as string | null) ?? 'КотДок — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста.'
  const appetite = (full?.appetite as string | null) ?? null
  const activity = (full?.activity as string | null) ?? null
  const duration = (full?.duration as string | null) ?? null
  const stool = (full?.stool as string | null) ?? null

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-2xl font-bold">🐱 КотДок</Link>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Назад</Link>
      </div>

      <div className="text-xs text-gray-400 mb-4">
        {new Date(check.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>

      <div className="space-y-4">
        <div className={`rounded-2xl border-2 p-6 ${urgency.color}`}>
          <div className="text-4xl mb-2">{urgency.emoji}</div>
          <div className="text-2xl font-bold mb-1">{urgency.label}</div>
          <div className="text-lg font-medium mb-2">{urgency.action}</div>
          <div className="text-sm opacity-75">{check.urgency_reason}</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Симптомы</h2>
          <p className="text-sm text-gray-700">{check.symptoms_input}</p>
          {(appetite || activity || duration || stool) && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Указано при проверке</p>
              <div className="flex flex-wrap gap-2">
                {appetite && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">Аппетит: {APPETITE_LABELS[appetite] ?? appetite}</span>}
                {activity && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">Активность: {ACTIVITY_LABELS[activity] ?? activity}</span>}
                {duration && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">Длительность: {DURATION_LABELS[duration] ?? duration}</span>}
                {stool && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">Стул: {STOOL_LABELS[stool] ?? stool}</span>}
              </div>
            </div>
          )}
        </div>

        {hasPhoto && photoObservations && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
            <h2 className="font-semibold text-blue-900 mb-2">📷 Что видно на фото</h2>
            <p className="text-sm text-blue-800">{photoObservations}</p>
          </div>
        )}

        {possibleCauses.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Возможные причины</h2>
            <ul className="space-y-2">
              {possibleCauses.map((cause, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                  {cause}
                </li>
              ))}
            </ul>
          </div>
        )}

        {check.cat_specific_warning && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
            <h2 className="font-semibold text-amber-900 mb-2">⚠️ Важно для кошек</h2>
            <p className="text-sm text-amber-800">{check.cat_specific_warning}</p>
          </div>
        )}

        {homeCareSteps.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Что делать дома</h2>
            <ol className="space-y-2">
              {homeCareSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-gray-700">
                  <span className="text-orange-500 font-medium shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {vetQuestions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">📋 Вопросы для ветеринара</h2>
            <ul className="space-y-2">
              {vetQuestions.map((q, i) => (
                <li key={i} className="text-sm text-gray-700 border-b border-gray-50 pb-2 last:border-0 last:pb-0">{q}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 text-center">
          {disclaimer}
        </div>

        <Link
          href="/dashboard"
          className="block w-full bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors text-sm text-center"
        >
          В личный кабинет
        </Link>
      </div>
    </div>
  )
}
