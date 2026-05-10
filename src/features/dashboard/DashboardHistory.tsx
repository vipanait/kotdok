'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import CheckResultContent, { type SymptomCheckRecord } from '@/features/symptom-check/CheckResultContent'
import { URGENCY_DOT_CLASS, URGENCY_TEXT_CLASS, type UrgencyKey } from '@/shared/utils/urgency'

interface Props {
  checks: SymptomCheckRecord[]
  emptyActionHref?: string
  emptyActionLabel?: string
}

export default function DashboardHistory({ checks, emptyActionHref, emptyActionLabel }: Props) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.dashboard
  const [selectedCheck, setSelectedCheck] = useState<SymptomCheckRecord | null>(null)

  if (!checks.length) {
    return (
      <div className="app-empty-state">
        <h3 className="text-base font-bold text-text">{t.checksEmptyTitle}</h3>
        <p className="mt-1 text-sm leading-relaxed">{t.noChecks}</p>
        {emptyActionHref && emptyActionLabel && (
          <Link href={emptyActionHref} className="app-button-secondary app-button-sm mt-4">
            {emptyActionLabel}
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      <ul className="grid gap-2">
        {checks.map(check => {
          const key = check.urgency as UrgencyKey
          const urgencyText = dict.urgency[key]
          return (
            <li key={check.id}>
              <button
                type="button"
                onClick={() => setSelectedCheck(check)}
                className="app-focus-ring group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-hairline/70 bg-canvas/30 px-3 py-3 text-left transition-colors hover:border-card-soft-strong hover:bg-canvas-soft/80 focus-visible:bg-canvas-soft/80"
                aria-label={`${t.openCheck}: ${check.symptoms_input}`}
              >
                <span className={`block h-2.5 w-2.5 shrink-0 rounded-full ${URGENCY_DOT_CLASS[key] ?? 'bg-text-faint'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-text line-clamp-1">{check.symptoms_input}</p>
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
                  {urgencyText?.label ? urgencyText.label.charAt(0) + urgencyText.label.slice(1).toLowerCase() : ''}
                </span>
                <span className="hidden rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors group-hover:text-text sm:inline-flex">
                  {t.openCheck}
                </span>
                <span className="text-text-faint shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden>›</span>
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
