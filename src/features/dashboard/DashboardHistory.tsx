'use client'

import { useEffect, useState } from 'react'
import { URGENCY_EMOJI } from '@/shared/utils/urgency'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import CheckResultContent, { type SymptomCheckRecord } from '@/features/symptom-check/CheckResultContent'

interface Props {
  checks: SymptomCheckRecord[]
}

export default function DashboardHistory({ checks }: Props) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.dashboard
  const [selectedCheck, setSelectedCheck] = useState<SymptomCheckRecord | null>(null)

  if (!checks.length) {
    return <p className="text-sm text-gray-500">{t.noChecks}</p>
  }

  return (
    <>
      <ul className="space-y-3">
        {checks.map(check => (
          <li key={check.id}>
            <button
              type="button"
              onClick={() => setSelectedCheck(check)}
              className="flex w-full gap-3 items-start border-b border-gray-50 pb-3 last:border-0 last:pb-0 hover:bg-gray-50 rounded-lg px-2 py-1 -mx-2 transition-colors text-left"
            >
              <span className="text-xl shrink-0">{URGENCY_EMOJI[check.urgency] ?? '⚪'}</span>
              <div className="min-w-0">
                <p className="text-sm text-gray-800 line-clamp-2">{check.symptoms_input}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(check.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </button>
          </li>
        ))}
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[95dvh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">{dict.dashboard.checkHistory}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-xl leading-none"
              aria-label={dict.common.close}
            >
              ×
            </button>
          </div>
          <CheckResultContent check={check} />
        </div>
      </div>
    </div>
  )
}
