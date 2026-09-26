'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { localToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import MedicalRecordView, { RetryButton } from './MedicalRecordView'
import { useMedicalRecord } from './use-medical-record'

/**
 * `/pets/[id]`: the medical record, loaded through the v1 API with the
 * site's session. Every state is its own screen — a skeleton while loading,
 * an error with a retry instead of an empty record, the old data with a
 * banner when a refresh fails, and nothing of the record when the pet is not
 * the caller's or the session is gone.
 */
export default function MedicalRecordScreen({ petId }: { petId: string }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.states
  const router = useRouter()
  const { state, reload } = useMedicalRecord(petId)
  // The owner's day, from the browser's clock; read once the record is on screen.
  const [today] = useState(() => localToday())
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
      return <RecordSkeleton label={words.loading} title={dict.medicalRecord.title} subtitle={dict.medicalRecord.loadingSubtitle} />

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
          <Link href={`/login?next=${encodeURIComponent(`/pets/${petId}`)}`} className="btn primary">
            {words.signIn}
          </Link>
        </section>
      )

    case 'ready':
      return (
        <MedicalRecordView
          petId={petId}
          overview={state.data.overview}
          checks={state.data.checks}
          today={today}
          onRetry={reload}
          retrying={state.refreshing}
          notice={
            state.stale && (
              <div className="banner error health-stale" role="alert">
                <span>{words.stale}</span>
                <RetryButton onRetry={reload} retrying={state.refreshing} dict={dict} className="link" />
              </div>
            )
          }
        />
      )
  }
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
