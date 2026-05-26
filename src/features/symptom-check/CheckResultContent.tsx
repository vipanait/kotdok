'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { URGENCY_BG_CLASS, URGENCY_DOT_CLASS, URGENCY_TEXT_CLASS, type UrgencyKey } from '@/shared/utils/urgency'

export interface SymptomCheckRecord {
  id: string
  symptoms_input: string
  urgency: string
  urgency_reason: string
  possible_causes: unknown
  cat_specific_warning: string | null
  home_care_steps: unknown
  vet_questions: unknown
  full_response: Record<string, unknown> | null
  created_at: string
}

interface Props {
  check: SymptomCheckRecord
  showBackLink?: boolean
}

export default function CheckResultContent({ check, showBackLink = false }: Props) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.check

  const full = check.full_response
  const urgencyKey = check.urgency as UrgencyKey
  const urgencyText = dict.urgency[urgencyKey]
  const isPositive = urgencyKey === 'healthy' || urgencyKey === 'home_care'
  const stepBg = isPositive ? 'bg-status-good-fg' : 'bg-accent'

  const possibleCauses: string[] = Array.isArray(check.possible_causes) ? check.possible_causes : []
  const homeCareSteps: string[] = Array.isArray(check.home_care_steps) ? check.home_care_steps : []
  const vetQuestions: string[] = Array.isArray(check.vet_questions) ? check.vet_questions : []
  const additionalCatInfoNeeded: string[] = Array.isArray(full?.additional_cat_info_needed) ? full.additional_cat_info_needed as string[] : []
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

  const dateStr = new Date(check.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).toUpperCase()

  return (
    <div className="-mx-6 sm:-mx-8 -mt-6 sm:-mt-8 space-y-0">
      {/* Colored urgency block */}
      <div className={`${URGENCY_BG_CLASS[urgencyKey] ?? 'bg-status-good-bg'} px-6 sm:px-8 pt-6 pb-7`}>
        <div className="text-[11px] font-semibold tracking-wider text-text-muted">{dateStr}</div>
        <h1 className={`mt-4 font-extrabold text-3xl sm:text-4xl flex items-center gap-3 ${URGENCY_TEXT_CLASS[urgencyKey] ?? 'text-text'}`}>
          <span className={`inline-block h-3 w-3 rounded-full ${URGENCY_DOT_CLASS[urgencyKey] ?? 'bg-text-faint'}`} aria-hidden />
          {urgencyText?.label ? capitalize(urgencyText.label) : ''}
        </h1>
        <p className="mt-2 text-sm font-semibold text-text">{urgencyText?.action}</p>
        <p className="mt-1 text-sm text-text-muted">{check.urgency_reason}</p>
      </div>

      <div className="px-6 sm:px-8 pt-6 pb-2 space-y-6">
        {/* Symptoms */}
        <Section title={t.symptoms}>
          <p className="text-sm text-text">{check.symptoms_input}</p>
          {(appetite || activity || duration || stool) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {appetite && <Chip label={`${t.appetitePrefix}: ${appetiteLabels[appetite] ?? appetite}`} />}
              {activity && <Chip label={`${t.activityPrefix}: ${activityLabels[activity] ?? activity}`} />}
              {duration && <Chip label={`${t.durationPrefix}: ${durationLabels[duration] ?? duration}`} />}
              {stool && <Chip label={`${t.stoolPrefix}: ${stoolLabels[stool] ?? stool}`} />}
            </div>
          )}
        </Section>

        {hasPhoto && photoObservations && (
          <Section title={t.photoObservations}>
            <p className="text-sm text-text">{photoObservations}</p>
          </Section>
        )}

        {/* Possible causes — colored leading dashes */}
        {possibleCauses.length > 0 && (
          <Section title={t.possibleCauses}>
            <ul className="space-y-2">
              {possibleCauses.map((cause, i) => (
                <li key={i} className="flex gap-3 text-sm text-text">
                  <span className={`mt-2 block h-px w-4 shrink-0 ${isPositive ? 'bg-status-good-fg' : 'bg-accent'}`} aria-hidden />
                  {cause}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Tip card with left orange border */}
        {check.cat_specific_warning && (
          <div className="rounded-2xl bg-[#FBEFC5] p-5 border-l-4 border-accent">
            <p className="text-sm font-semibold text-text mb-1">⚠️ {t.catWarning}</p>
            <p className="text-sm text-text-muted">{check.cat_specific_warning}</p>
          </div>
        )}

        {additionalCatInfoNeeded.length > 0 && (
          <Section title={t.additionalCatInfoNeeded}>
            <ul className="space-y-2">
              {additionalCatInfoNeeded.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm text-text">
                  <span className="mt-1.5 block h-2 w-2 rounded-full bg-accent shrink-0" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Home-care numbered steps */}
        {homeCareSteps.length > 0 && (
          <Section title={t.homeCare}>
            <ol className="space-y-3">
              {homeCareSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-text">
                  <span className={`shrink-0 w-6 h-6 rounded-full ${stepBg} text-white text-xs font-semibold flex items-center justify-center`}>
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Vet questions card */}
        {vetQuestions.length > 0 && (
          <div className="rounded-2xl bg-card-soft p-5">
            <p className="text-xs font-semibold tracking-wider text-text-muted uppercase mb-3">
              💡 {t.vetQuestions}
            </p>
            <ul className="divide-y divide-[#E8D5B0]">
              {vetQuestions.map((q, i) => (
                <li key={i} className="text-sm text-text py-2 first:pt-0 last:pb-0">{q}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-xs text-text-faint pt-2">{disclaimer}</p>

        {showBackLink && (
          <Link
            href="/dashboard"
            className="block w-full rounded-full bg-accent text-white py-3 font-semibold hover:bg-accent-hover transition-colors text-sm text-center"
          >
            {t.toAccount}
          </Link>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-text-muted uppercase mb-2">{title}</p>
      {children}
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 rounded-full text-xs bg-canvas-soft text-text-muted">
      {label}
    </span>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0) + s.slice(1).toLowerCase()
}
