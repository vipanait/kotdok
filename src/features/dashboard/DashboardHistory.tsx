'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import CheckResultContent, { type SymptomCheckRecord } from '@/features/symptom-check/CheckResultContent'
import { URGENCY_DOT_CLASS, URGENCY_TEXT_CLASS, type UrgencyKey } from '@/shared/utils/urgency'

interface Props {
  checks: SymptomCheckRecord[]
}

export default function DashboardHistory({ checks }: Props) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.dashboard
  const [selectedCheck, setSelectedCheck] = useState<SymptomCheckRecord | null>(null)

  if (!checks.length) {
    return <p className="text-sm text-text-muted">{t.noChecks}</p>
  }

  return (
    <>
      <ul className="divide-y divide-hairline -my-3">
        {checks.map(check => {
          const key = check.urgency as UrgencyKey
          const urgencyText = dict.urgency[key]
          return (
            <li key={check.id}>
              <button
                type="button"
                onClick={() => setSelectedCheck(check)}
                className="w-full text-left py-4 transition-colors flex items-center gap-3 hover:bg-canvas-soft/40 -mx-4 px-4 rounded-xl"
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
                <span className="text-text-faint shrink-0" aria-hidden>›</span>
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[95dvh] overflow-y-auto relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-text/70 hover:text-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-xl leading-none"
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
