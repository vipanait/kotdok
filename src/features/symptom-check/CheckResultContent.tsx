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
  species_specific_warning?: string | null
  /** @deprecated Use species_specific_warning */
  cat_specific_warning?: string | null
  home_care_steps: unknown
  vet_questions: unknown
  full_response: Record<string, unknown> | null
  created_at: string
  pet_id?: string | null
  pet_name?: string | null
  pet_species?: 'cat' | 'dog' | null
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
  const isCritical = CLINIC_CTA_STATUSES.has(urgencyKey)
  const stepBg = isPositive ? 'bg-status-good-fg' : urgencyKey === 'monitor' ? 'bg-status-watch-fg' : 'bg-accent'

  const possibleCauses: string[] = Array.isArray(check.possible_causes) ? check.possible_causes : []
  const homeCareSteps: string[] = Array.isArray(check.home_care_steps) ? check.home_care_steps : []
  const vetQuestions: string[] = Array.isArray(check.vet_questions) ? check.vet_questions : []
  const speciesWarning = check.species_specific_warning ?? check.cat_specific_warning ?? null
  const additionalPetInfoNeeded: string[] = Array.isArray(full?.additional_pet_info_needed)
    ? full.additional_pet_info_needed as string[]
    : Array.isArray(full?.additional_cat_info_needed)
      ? full.additional_cat_info_needed as string[]
      : []
  const warningTitle = check.pet_species === 'dog'
    ? t.dogWarning
    : check.pet_species === 'cat'
      ? t.catWarning
      : t.petWarning
  const photoObservations = (full?.photo_observations as string | null) ?? null
  const hasPhoto = !!(full?.has_photo)
  const disclaimer = (full?.disclaimer as string | null) ?? 'Лапка — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста.'
  const appetite = (full?.appetite as string | null) ?? null
  const activity = (full?.activity as string | null) ?? null
  const duration = (full?.duration as string | null) ?? null
  const stool = (full?.stool as string | null) ?? null
  const painSigns: string[] = Array.isArray(full?.pain_signs) ? full.pain_signs as string[] : []

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
  const painSignLabels: Record<string, string> = {
    tense: t.painTense,
    hunched: t.painHunched,
    grimace: t.painGrimace,
    touch_sensitive: t.painTouchSensitive,
    hiding: t.painHiding,
    vocalizing: t.painVocalizing,
  }

  const dateStr = new Date(check.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const showClinicCta = isCritical
  const showVetSection = VET_STATUSES.has(urgencyKey) && vetQuestions.length > 0
  const showHomeCareSection = !isHealthy && homeCareSteps.length > 0
  const hasAnyDetails =
    !!check.symptoms_input ||
    possibleCauses.length > 0 ||
    !!speciesWarning ||
    additionalPetInfoNeeded.length > 0 ||
    (hasPhoto && !!photoObservations)

  const statusLabel = urgencyText?.label ? capitalize(urgencyText.label) : ''

  return (
    <div className="-mx-6 sm:-mx-8 -mt-6 sm:-mt-8">
      {/* Status plate — full width; top padding leaves room for the modal close button */}
      <div className="px-6 sm:px-8 pt-12 sm:pt-14">
        <div className={`rounded-2xl ${URGENCY_BG_CLASS[urgencyKey] ?? 'bg-status-good-bg'} px-5 py-5 sm:px-6`}>
          <div className="text-[11px] font-semibold tracking-wide text-text-muted">{dateStr}</div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-2 rounded-full bg-card/80 px-3 py-1.5 text-sm font-bold shadow-sm ring-1 ring-black/5 ${URGENCY_TEXT_CLASS[urgencyKey] ?? 'text-text'}`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${URGENCY_DOT_CLASS[urgencyKey] ?? 'bg-text-faint'}`}
                aria-hidden
              />
              {statusLabel}
            </span>
          </div>

          <p className="mt-3 text-base font-semibold text-text">{urgencyText?.action}</p>
          {check.urgency_reason && (
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{check.urgency_reason}</p>
          )}
        </div>
      </div>

      {/* Clinic CTA — primary action for critical statuses */}
      {showClinicCta && (
        <div className="px-6 sm:px-8 pt-4">
          <a
            href="https://www.google.com/maps/search/?api=1&query=ветеринарная+клиника"
            target="_blank"
            rel="noopener noreferrer"
            className="app-button-primary w-full px-5 py-3.5 text-sm sm:text-base"
          >
            {t.findClinic}
          </a>
        </div>
      )}

      <div className="px-6 sm:px-8 pt-5 pb-2 space-y-4">
        {isHealthy && (
          <p className="text-base font-medium text-text">{t.keepCare}</p>
        )}

        {showHomeCareSection && (
          <SectionCard accent={isPositive ? 'good' : urgencyKey === 'monitor' ? 'watch' : isCritical ? 'urgent' : 'accent'}>
            <h3 className="mb-3 text-base font-bold text-text">{t.homeCare}</h3>
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

        {showVetSection && (
          <SectionCard accent="muted">
            <h3 className="mb-3 text-base font-bold text-text">{t.vetQuestions}</h3>
            <ul className="space-y-2.5">
              {vetQuestions.map((q, i) => (
                <li key={i} className="flex gap-3 text-sm text-text">
                  <span className="mt-2 block h-px w-3.5 shrink-0 bg-text-faint" aria-hidden />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {speciesWarning && !isHealthy && (
          <SectionCard accent={isCritical ? 'urgent' : 'watch'}>
            <h3 className="mb-1.5 text-base font-bold text-text">{warningTitle}</h3>
            <p className="text-sm leading-relaxed text-text-muted">{speciesWarning}</p>
          </SectionCard>
        )}

        {hasAnyDetails && (
          <DetailsAccordion
            showLabel={t.showDetails}
            hideLabel={t.hideDetails}
            defaultOpen={isHealthy}
          >
            <div className="space-y-5 pt-1">
              {check.symptoms_input && (
                <Section title={t.youDescribed}>
                  <p className="text-sm text-text">{check.symptoms_input}</p>
                  {(appetite || activity || duration || stool || painSigns.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {appetite && <Chip label={`${t.appetitePrefix}: ${appetiteLabels[appetite] ?? appetite}`} />}
                      {activity && <Chip label={`${t.activityPrefix}: ${activityLabels[activity] ?? activity}`} />}
                      {duration && <Chip label={`${t.durationPrefix}: ${durationLabels[duration] ?? duration}`} />}
                      {stool && <Chip label={`${t.stoolPrefix}: ${stoolLabels[stool] ?? stool}`} />}
                      {painSigns.map(sign => (
                        <Chip
                          key={sign}
                          label={`${t.painSignsPrefix}: ${painSignLabels[sign] ?? sign}`}
                        />
                      ))}
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
                        <span className={`mt-2 block h-px w-3.5 shrink-0 ${isPositive ? 'bg-status-good-fg' : 'bg-accent'}`} aria-hidden />
                        {cause}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {additionalPetInfoNeeded.length > 0 && (
                <Section title={t.additionalPetInfoNeeded}>
                  <ul className="space-y-2">
                    {additionalPetInfoNeeded.map((item, i) => (
                      <li key={i} className="flex gap-3 text-sm text-text">
                        <span className="mt-1.5 block h-1.5 w-1.5 rounded-full bg-text-faint shrink-0" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          </DetailsAccordion>
        )}

        <p className="text-center text-xs text-text-faint pt-1">{disclaimer}</p>

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
  accent: 'accent' | 'good' | 'watch' | 'urgent' | 'muted'
  children: React.ReactNode
}

function SectionCard({ accent, children }: SectionCardProps) {
  const surface =
    accent === 'good' ? 'border-status-good-fg/20 bg-status-good-bg/35'
    : accent === 'watch' ? 'border-status-watch-fg/25 bg-[#FBEFC5]/55'
    : accent === 'urgent' ? 'border-status-urgent-fg/25 bg-status-urgent-bg/70'
    : accent === 'muted' ? 'border-hairline bg-canvas-soft/50'
    : 'border-accent/25 bg-accent-soft/45'

  return (
    <div className={`rounded-2xl border p-5 ${surface}`}>
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
    <div className="rounded-2xl border border-hairline bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="app-focus-ring flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-text transition-colors hover:bg-canvas-soft/60 cursor-pointer"
        aria-expanded={open}
      >
        <span>{open ? hideLabel : showLabel}</span>
        <span
          aria-hidden
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-canvas-soft text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="block">
            <path
              d="M2.5 4.25L6 7.75L9.5 4.25"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open && (
        <div className="border-t border-hairline px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-text">{title}</p>
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
