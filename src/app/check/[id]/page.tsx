import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { URGENCY_CONFIG } from '@/lib/urgency'
import type { UrgencyKey } from '@/lib/urgency'
import { getLocale } from '@/lib/i18n/getLocale'
import { getDictionary } from '@/lib/i18n/getDictionary'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function CheckResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.check

  const service = createServiceClient()
  const { data: check } = await service
    .from('symptom_checks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!check) notFound()

  const full = check.full_response as Record<string, unknown> | null
  const urgencyKey = check.urgency as UrgencyKey
  const urgencyConfig = URGENCY_CONFIG[urgencyKey]
  const urgencyText = dict.urgency[urgencyKey]

  const possibleCauses: string[] = Array.isArray(check.possible_causes) ? check.possible_causes : []
  const homeCareSteps: string[] = Array.isArray(check.home_care_steps) ? check.home_care_steps : []
  const vetQuestions: string[] = Array.isArray(check.vet_questions) ? check.vet_questions : []
  const photoObservations = (full?.photo_observations as string | null) ?? null
  const hasPhoto = !!(full?.has_photo)
  const disclaimer = (full?.disclaimer as string | null) ?? 'Лапка — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста.'
  const appetite = (full?.appetite as string | null) ?? null
  const activity = (full?.activity as string | null) ?? null
  const duration = (full?.duration as string | null) ?? null
  const stool = (full?.stool as string | null) ?? null

  const appetiteLabels: Record<string, string> = {
    normal: t.appetiteNormal, reduced: t.appetiteReduced, none: t.appetiteNone,
  }
  const activityLabels: Record<string, string> = {
    normal: t.activityNormal, low: t.activityLow, lethargic: t.activityLethargic,
  }
  const durationLabels: Record<string, string> = {
    today: t.durationToday, '2-3days': t.duration2_3days, 'week+': t.durationWeekPlus,
  }
  const stoolLabels: Record<string, string> = {
    normal: t.stoolNormal, loose: t.stoolLoose, absent: t.stoolAbsent, bloody: t.stoolBloody,
  }

  return (
    <AppShell right={
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">{dict.common.back}</Link>
    }>

      <div className="text-xs text-gray-400 mb-4">
        {new Date(check.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </div>

      <div className="space-y-4">
        <div className={`rounded-2xl border-2 p-6 ${urgencyConfig.color}`}>
          <div className="text-4xl mb-2">{urgencyConfig.emoji}</div>
          <h1 className="text-2xl font-bold mb-1">{urgencyText.label}</h1>
          <div className="text-lg font-medium mb-2">{urgencyText.action}</div>
          <div className="text-sm opacity-75">{check.urgency_reason}</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-2">{t.symptoms}</h2>
          <p className="text-sm text-gray-700">{check.symptoms_input}</p>
          {(appetite || activity || duration || stool) && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{t.notedDuringCheck}</p>
              <div className="flex flex-wrap gap-2">
                {appetite && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">{t.appetitePrefix}: {appetiteLabels[appetite] ?? appetite}</span>}
                {activity && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">{t.activityPrefix}: {activityLabels[activity] ?? activity}</span>}
                {duration && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">{t.durationPrefix}: {durationLabels[duration] ?? duration}</span>}
                {stool && <span className="px-3 py-1 rounded-full text-xs bg-gray-50 border border-gray-200 text-gray-600">{t.stoolPrefix}: {stoolLabels[stool] ?? stool}</span>}
              </div>
            </div>
          )}
        </div>

        {hasPhoto && photoObservations && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
            <h2 className="font-semibold text-blue-900 mb-2">{t.photoObservations}</h2>
            <p className="text-sm text-blue-800">{photoObservations}</p>
          </div>
        )}

        {possibleCauses.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">{t.possibleCauses}</h2>
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
            <h2 className="font-semibold text-amber-900 mb-2">{t.catWarning}</h2>
            <p className="text-sm text-amber-800">{check.cat_specific_warning}</p>
          </div>
        )}

        {homeCareSteps.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">{t.homeCare}</h2>
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
            <h2 className="font-semibold text-gray-900 mb-3">{t.vetQuestions}</h2>
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
          {t.toAccount}
        </Link>
      </div>
    </AppShell>
  )
}
