'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import CheckResultContent, { type SymptomCheckRecord } from '@/features/symptom-check/CheckResultContent'
import { URGENCY_TEXT_CLASS, type UrgencyKey } from '@/shared/utils/urgency'

interface Props {
  checks: SymptomCheckRecord[]
  emptyActionHref?: string
  emptyActionLabel?: string
}

function AccentedCopy({ template, accent }: { template: string; accent: string }) {
  const parts = template.split('{accent}')
  if (parts.length < 2) return <>{template}</>
  return (
    <>
      {parts[0]}
      <span className="app-accent-serif">{accent}</span>
      {parts.slice(1).join('{accent}')}
    </>
  )
}

export default function DashboardHistory({ checks, emptyActionHref, emptyActionLabel }: Props) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.dashboard
  const [selectedCheck, setSelectedCheck] = useState<SymptomCheckRecord | null>(null)

  if (!checks.length) {
    return (
      <div className="app-empty-state py-6 text-center">
        <h3 className="text-base font-bold text-text">{t.checksEmptyTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          <AccentedCopy template={t.noChecks} accent={t.noChecksAccent} />
        </p>
        {emptyActionHref && emptyActionLabel && (
          <Link href={emptyActionHref} className="app-button-secondary app-button-sm mt-5">
            {emptyActionLabel}
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-hairline/70">
        {checks.map(check => {
          const key = check.urgency as UrgencyKey
          const urgencyText = dict.urgency[key]
          const statusLabel = urgencyText?.label
            ? urgencyText.label.charAt(0) + urgencyText.label.slice(1).toLowerCase()
            : ''
          return (
            <li key={check.id}>
              <button
                type="button"
                onClick={() => setSelectedCheck(check)}
                className="app-focus-ring group flex w-full cursor-pointer items-center gap-3 py-3.5 text-left transition-colors hover:bg-canvas-soft/40 -mx-2 px-2 rounded-xl"
                aria-label={`${t.openCheck}: ${check.symptoms_input}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-text line-clamp-1">{check.symptoms_input}</p>
                  <p className="text-xs text-text-faint mt-0.5">
                    {new Date(check.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${URGENCY_TEXT_CLASS[key] ?? 'text-text-muted'}`}>
                  {statusLabel}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {selectedCheck && (
        <HistoryModal check={selectedCheck} onClose={() => setSelectedCheck(null)} />
      )}
    </>
  )
}

function HistoryModal({ check, onClose }: { check: SymptomCheckRecord; onClose: () => void }) {
  const dict = useTranslations()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dict.dashboard.checkHistory}
      className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="app-card relative max-h-[95dvh] w-full overflow-y-auto rounded-b-none sm:max-w-2xl sm:rounded-b-3xl">
        <button
          type="button"
          onClick={onClose}
          className="app-icon-button absolute top-4 right-4 z-10 text-xl leading-none"
          aria-label={dict.common.close}
        >
          ×
        </button>
        <div className="p-6 sm:p-8">
          <CheckResultContent check={check} />
        </div>
      </div>
    </div>
  )
}
