'use client'

import { useState } from 'react'
import { useTranslations } from '@/components/LocaleProvider'
import { browserApi } from '@/features/api/browser-api'

/**
 * «Записать в медкарту» of a closed case (`PUT /followups/{id}/record`):
 * idempotent on the server, so a second press or a retry adds nothing twice.
 * «Записано» only once the server said so.
 */
export default function RecordSaveButton({
  caseId,
  saved: initiallySaved,
  className = 'btn primary btn-block',
  allowRemove = false,
}: {
  caseId: string
  saved: boolean
  className?: string
  /** «Убрать из медкарты» once saved (the timeline). */
  allowRemove?: boolean
}) {
  const words = useTranslations().followup
  const [saved, setSaved] = useState(initiallySaved)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function toggle(next: boolean) {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const result = next ? await browserApi().saveFollowupToRecord(caseId) : await browserApi().removeFollowupFromRecord(caseId)
      setSaved(result.saved_to_record_at !== null)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="followup-record">
      {saved ? (
        <p className="followup-record-saved" role="status">
          <span aria-hidden>✓</span>
          {words.recordSaved}
        </p>
      ) : (
        <button type="button" className={className} onClick={() => void toggle(true)} aria-disabled={busy || undefined}>
          {busy ? words.recordSaving : words.recordSave}
        </button>
      )}
      {saved && allowRemove && (
        <button type="button" className="link" onClick={() => void toggle(false)} aria-disabled={busy || undefined}>
          {words.recordRemove}
        </button>
      )}
      {failed && (
        <p className="banner error followup-error" role="alert">
          {words.recordFailed}
        </p>
      )}
    </div>
  )
}
