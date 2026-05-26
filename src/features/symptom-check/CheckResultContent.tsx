'use client'

import { useState } from 'react'
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

// Statuses that imply "going to vet" — vet questions expanded by default.
const VET_STATUSES = new Set<UrgencyKey>(['emergency', 'urgent', 'monitor'])
// Statuses that show the "Find clinic" CTA right under the hero.
const CLINIC_CTA_STATUSES = new Set<UrgencyKey>(['emergency', 'urgent'])
// Statuses with positive outcome — green numbered steps instead of orange.
const POSITIVE_STATUSES = new Set<UrgencyKey>(['healthy', 'home_care'])

export default function CheckResultContent({ check, showBackLink = false }: Props) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.check

  const full = check.full_response
  const urgencyKey = check.urgency as UrgencyKey
  const urgencyText = dict.urgency[urgencyKey]
  const isPositive = POSITIVE_STATUSES.has(urgencyKey)
  const isHealthy = urgencyKey === 'healthy'
  const stepBg = isPositive ? 'bg-status-good-fg' : urgencyKey === 'monitor' ? 'bg-status-watch-fg' : 'bg-accent'

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

  const showClinicCta = CLINIC_CTA_STATUSES.has(urgencyKey)
  const showVetSection = VET_STATUSES.has(urgencyKey) && vetQuestions.length > 0
  const showHomeCareSection = !isHealthy && homeCareSteps.length > 0
  const hasAnyDetails =
    !!check.symptoms_input ||
    possibleCauses.length > 0 ||
    !!check.cat_specific_warning ||
    additionalCatInfoNeeded.length > 0 ||
    (hasPhoto && !!photoObservations)

  return (
    <div className="-mx-6 sm:-mx-8 -mt-6 sm:-mt-8">
      {/* Hero — status + action + reason */}
      <div className={`${URGENCY_BG_CLASS[urgencyKey] ?? 'bg-status-good-bg'} px-6 sm:px-8 pt-6 pb-6`}>
        <div className="text-[11px] font-semibold tracking-wider text-text-muted">{dateStr}</div>
        <h1 className={`mt-3 font-extrabold text-3xl sm:text-4xl flex items-center gap-3 ${URGENCY_TEXT_CLASS[urgencyKey] ?? 'text-text'}`}>
          <span className={`inline-block h-3 w-3 rounded-full ${URGENCY_DOT_CLASS[urgencyKey] ?? 'bg-text-faint'}`} aria-hidden />
          {urgencyText?.label ? capitalize(urgencyText.label) : ''}
        </h1>
        <p className="mt-1 text-sm font-semibold text-text">{urgencyText?.action}</p>
        {check.urgency_reason && (
          <p className="mt-2 text-sm text-text-muted">{check.urgency_reason}</p>
        )}
      </div>

      {/* Clinic CTA right under the hero for urgent / emergency */}
      {showClinicCta && (
        <div className="px-6 sm:px-8 pt-5">
          <a
            href="https://www.google.com/maps/search/?api=1&query=ветеринарная+клиника"
            target="_blank"
            rel="noopener noreferrer"
            className="app-button-primary w-full px-5 py-3.5 text-sm sm:text-base"
          >
            🏥 {t.findClinic}
          </a>
        </div>
      )}

      <div className="px-6 sm:px-8 pt-6 pb-2 space-y-6">
        {/* Healthy = single calm line, no steps */}
        {isHealthy && (
          <p className="text-base font-medium text-text">{t.keepCare}</p>
        )}

        {/* What to do — primary action block */}
        {showHomeCareSection && (
          <SectionCard
            title={t.homeCare}
            accent={isPositive ? 'good' : urgencyKey === 'monitor' ? 'watch' : 'accent'}
            icon="🎯"
          >
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
          </SectionCard>
        )}

        {/* Ask the vet — expanded for statuses where we point user to a vet */}
        {showVetSection && (
          <SectionCard title={t.vetQuestions} icon="💡" accent="muted">
            <ul className="space-y-2">
              {vetQuestions.map((q, i) => (
                <li key={i} className="flex gap-3 text-sm text-text">
                  <span className="mt-2 block h-px w-4 shrink-0 bg-text-muted" aria-hidden />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* Important for cats — always visible if present (concise warning) */}
        {check.cat_specific_warning && !isHealthy && (
          <div className="rounded-2xl bg-[#FBEFC5] p-5 border-l-4 border-accent">
            <p className="text-sm font-semibold text-text mb-1">{t.catWarning}</p>
            <p className="text-sm text-text-muted">{check.cat_specific_warning}</p>
          </div>
        )}

        {/* Collapsible details */}
        {hasAnyDetails && (
          <DetailsAccordion
            showLabel={t.showDetails}
            hideLabel={t.hideDetails}
            defaultOpen={isHealthy}
          >
            <div className="space-y-5 pt-2">
              {/* You described */}
              {check.symptoms_input && (
                <Section title={t.youDescribed}>
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
              )}

              {hasPhoto && photoObservations && (
                <Section title={t.photoObservations}>
                  <p className="text-sm text-text">{photoObservations}</p>
                </Section>
              )}

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
            </div>
          </DetailsAccordion>
        )}

        <p className="text-center text-xs text-text-faint pt-2">{disclaimer}</p>

        {showBackLink && (
          <Link
            href="/dashboard"
            className="app-button-primary w-full py-3 text-sm"
          >
            {t.toAccount}
          </Link>
        )}
      </div>
    </div>
  )
}

interface SectionCardProps {
  title: string
  icon?: string
  accent: 'accent' | 'good' | 'watch' | 'muted'
  children: React.ReactNode
}

function SectionCard({ title, icon, accent, children }: SectionCardProps) {
  const borderClass =
    accent === 'good' ? 'border-status-good-fg/30 bg-status-good-bg/30'
    : accent === 'watch' ? 'border-status-watch-fg/30 bg-[#FBEFC5]/40'
    : accent === 'muted' ? 'border-hairline bg-canvas-soft/40'
    : 'border-accent/30 bg-accent-soft/40'

  return (
    <div className={`rounded-2xl border ${borderClass} p-5`}>
      <div className="mb-3 flex items-center gap-2">
        {icon && <span className="text-base" aria-hidden>{icon}</span>}
        <h3 className="text-sm font-extrabold tracking-wide text-text uppercase">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function DetailsAccordion({
  showLabel,
  hideLabel,
  defaultOpen,
  children,
}: {
  showLabel: string
  hideLabel: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-hairline pt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-2 py-2 text-sm font-semibold text-text-muted hover:text-text transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <span>{open ? hideLabel : showLabel}</span>
        <span aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && <div>{children}</div>}
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
