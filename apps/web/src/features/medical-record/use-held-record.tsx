'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from '@/components/LocaleProvider'
import { NOTHING_HELD, holdRecord, takeFresh, type Drift, type Fresh, type HeldState } from './held-record'

/**
 * The record an edit form works on (`held-record.ts` has the rules): what to
 * draw, the form's key, what happened to the record meanwhile. `fresh` null
 * while the page has nothing loaded. The form reports `setDirty`.
 */
export function useHeldRecord<T>(fresh: Fresh<T> | null): {
  record: T | null
  version: number
  drift: Drift | null
  setDirty: (dirty: boolean) => void
  takeLatest: () => void
  /**
   * The server refused the save because the record is done or gone: the next
   * load is shown as it is, whatever the form holds — the owner's own save
   * found out, there is nothing to keep the form for.
   */
  release: () => void
} {
  const [state, setState] = useState<HeldState<T>>(NOTHING_HELD)
  const [dirty, setDirty] = useState(false)
  const [released, setReleased] = useState(false)
  const next = fresh ? holdRecord(state, fresh, dirty && !released) : { state, drift: null }
  // Derived from the load during render (React's «storing information from previous renders»).
  if (next.state !== state) {
    setState(next.state)
    if (released) setReleased(false)
  }

  const freshRef = useRef(fresh)
  useEffect(() => {
    freshRef.current = fresh
  })
  const takeLatest = useCallback(() => {
    const latest = freshRef.current
    if (!latest) return
    setDirty(false)
    setState((current) => takeFresh(current, latest))
  }, [])

  const release = useCallback(() => setReleased(true), [])

  return { record: next.state.record, version: next.state.version, drift: next.drift, setDirty, takeLatest, release }
}

/**
 * The form stays as the owner left it; this says why it may no longer be
 * what is stored (MW-09), and what can be done about it.
 */
export function DriftNotice({
  drift,
  onTakeLatest,
  sectionHref,
  recordHref,
}: {
  drift: Drift | null
  onTakeLatest: () => void
  sectionHref: string
  recordHref: string | null
}) {
  const dict = useTranslations()
  const words = dict.medicalRecord.drift
  if (!drift) return null
  return (
    <div className="banner health-drift" role="status">
      <p>{words[drift]}</p>
      {drift === 'changed' && (
        <button type="button" className="link" onClick={onTakeLatest}>{words.takeLatest}</button>
      )}
      {drift === 'gone' && <Link href={sectionHref} className="link">{words.toSection}</Link>}
      {drift === 'closed' && recordHref && <Link href={recordHref} className="link">{words.openRecord}</Link>}
    </div>
  )
}
