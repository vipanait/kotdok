'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { localToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import MedicalRecordView, { RetryButton } from './MedicalRecordView'
import type { RecordState } from './record-load'
import SavedNotice from './SavedNotice'
import { useMedicalRecord } from './use-medical-record'

/**
 * `/pets/[id]`: the medical record, loaded through the v1 API with the
 * site's session. Every state is its own screen — a skeleton while loading,
 * an error with a retry instead of an empty record, the old data with a
 * banner when a refresh fails, and nothing of the record when the pet is not
 * the caller's or the session is gone. `formSaved`: back from the pet form
 * after a save — its confirmation, once the record is on screen.
 */
export default function MedicalRecordScreen({ petId, formSaved = false }: { petId: string; formSaved?: boolean }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.states
  const { state, reload } = useMedicalRecord(petId)
  // The owner's day, from the browser's clock; read once the record is on screen.
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return (
      <RecordProblem
        state={state}
        petId={petId}
        reload={reload}
        loading={<RecordSkeleton label={words.loading} title={dict.medicalRecord.title} subtitle={dict.medicalRecord.loadingSubtitle} />}
      />
    )
  }

  return (
    <MedicalRecordView
      petId={petId}
      overview={state.data.overview}
      checks={state.data.checks}
      today={today}
      onRetry={reload}
      retrying={state.refreshing}
      notice={
        <>
          {formSaved && <SavedNotice text={dict.medicalRecord.formSaved} />}
          <StaleNotice state={state} reload={reload} />
        </>
      }
    />
  )
}

/**
 * Every medical record page's screens for a record that is not there to
 * show: loading, a failed first load with a retry, a pet that is not the
 * caller's, a session that ended, an account being deleted.
 */
export function RecordProblem({
  state,
  petId,
  reload,
  loading,
  returnTo,
}: {
  state: Exclude<RecordState<unknown>, { status: 'ready' }>
  petId: string
  reload: () => void
  /** The page's own skeleton. */
  loading: React.ReactNode
  /** Where signing in again brings the owner back to; the record by default. */
  returnTo?: string
}) {
  const dict = useTranslations()
  const words = dict.medicalRecord.states
  const router = useRouter()
  const problemRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (state.status === 'deleting') router.replace('/account-deletion')
  }, [state.status, router])

  // A page that turned into an error or a refusal says so to a screen reader too.
  useEffect(() => {
    if (state.status === 'failed' || state.status === 'not_found' || state.status === 'signed_out') {
      problemRef.current?.focus()
    }
  }, [state.status])

  switch (state.status) {
    case 'loading':
    case 'deleting':
      return loading

    case 'failed':
      return (
        <section className="card health-problem" aria-labelledby="health-problem-title">
          <h1 id="health-problem-title" ref={problemRef} tabIndex={-1}>{words.failedTitle}</h1>
          <p>{words.failedBody}</p>
          <RetryButton onRetry={reload} retrying={state.retrying} dict={dict} className="btn primary" />
        </section>
      )

    case 'not_found':
      return (
        <section className="card health-problem" aria-labelledby="health-problem-title">
          <h1 id="health-problem-title" ref={problemRef} tabIndex={-1}>{words.notFoundTitle}</h1>
          <p>{words.notFoundBody}</p>
          <Link href="/pets" className="btn primary">{words.toPets}</Link>
        </section>
      )

    case 'signed_out':
      return (
        <section className="card health-problem" aria-labelledby="health-problem-title">
          <h1 id="health-problem-title" ref={problemRef} tabIndex={-1}>{words.signedOutTitle}</h1>
          <p>{words.signedOutBody}</p>
          <Link href={`/login?next=${encodeURIComponent(returnTo ?? `/pets/${petId}`)}`} className="btn primary">
            {words.signIn}
          </Link>
        </section>
      )
  }
}

/** A refresh failed over data already shown: say so, and offer to try again. */
export function StaleNotice({ state, reload }: { state: Extract<RecordState<unknown>, { status: 'ready' }>; reload: () => void }) {
  const dict = useTranslations()
  if (!state.stale) return null
  return (
    <div className="banner error health-stale" role="alert">
      <span>{dict.medicalRecord.states.stale}</span>
      <RetryButton onRetry={reload} retrying={state.refreshing} dict={dict} className="link" />
    </div>
  )
}

/** The loading screen of the design (web v1, «loading»): the head and the cards' outlines. */
function RecordSkeleton({ label, title, subtitle }: { label: string; title: string; subtitle: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="pagehead" aria-hidden>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="health-skeleton-grid" aria-hidden>
        <div className="skeleton-block health-skeleton-left" />
        <div className="skeleton-block health-skeleton-right" />
      </div>
    </div>
  )
}
