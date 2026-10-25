'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FollowupCaseSummary } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import { browserApi } from '@/features/api/browser-api'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import RecordSaveButton from './RecordSaveButton'
import { followupHref, visitFormHref } from './followup-view'

/**
 * What the owner can do with a case beside its timeline (В-4): an open case
 * takes a check-in now or stops its reminders — after a confirmation, since
 * that closes it without a health outcome; a case closed «better» goes to the
 * health record; one closed at the vet's offers the visit form.
 */
export default function CaseActions({ item, latestCheckId }: { item: FollowupCaseSummary; latestCheckId: string }) {
  const dict = useTranslations()
  const words = dict.followup
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const stopRef = useRef<HTMLButtonElement>(null)

  async function stop() {
    setBusy(true)
    setFailed(false)
    try {
      await browserApi().dismissFollowup(item.id)
      setAsking(false)
      router.refresh()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (item.status === 'active') {
    return (
      <section className="card followup-actions" aria-label={words.checkinNow}>
        <Link href={followupHref.checkin(item.id, { from: 'timeline' })} className="btn primary btn-block">
          {words.checkinNow}
        </Link>
        <button ref={stopRef} type="button" className="btn secondary btn-block" onClick={() => setAsking(true)}>
          {words.stopReminders}
        </button>
        {asking && (
          <ConfirmDialog
            title={words.stopTitle}
            body={words.stopBody}
            cancelLabel={words.cancel}
            confirmLabel={words.stopConfirm}
            busyLabel={words.stopBusy}
            busy={busy}
            error={failed ? words.stopFailed : undefined}
            onCancel={() => {
              setAsking(false)
              setFailed(false)
            }}
            onConfirm={() => void stop()}
            returnFocusRef={stopRef}
          />
        )}
      </section>
    )
  }

  if (item.outcome === 'improved') {
    return (
      <section className="card followup-actions" aria-labelledby="followup-save-title">
        <h2 id="followup-save-title">{words.saveHistoryTitle}</h2>
        <p>{words.saveHistoryBody}</p>
        <RecordSaveButton caseId={item.id} saved={item.saved_to_record_at !== null} className="btn primary" allowRemove />
      </section>
    )
  }

  if (item.outcome === 'vet_seen') {
    return (
      <section className="card followup-actions" aria-labelledby="followup-visit-title">
        <h2 id="followup-visit-title">{words.vetSeenTitle}</h2>
        <Link href={visitFormHref(item.pet_id, latestCheckId)} className="btn primary">
          {words.recordVisit}
        </Link>
      </section>
    )
  }

  return null
}
