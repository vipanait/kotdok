'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

/**
 * What every record form screen draws around its form — weight, vaccination
 * or treatment, «Сделано», course, visit — once, so the forms cannot drift
 * apart in how they wait or in how they say the form is not there.
 */

/** A ref whose element takes focus once, when it is first drawn. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

/**
 * In place of a form: the record is gone, was done meanwhile, or has nothing
 * left to change. Its heading takes focus, so a screen reader starts from
 * why, and the one way on is a link.
 */
export function FormNotice({ id, title, body, href, action }: { id: string; title: string; body: string; href: string; action: string }) {
  const ref = useFocusOnMount<HTMLHeadingElement>()
  const titleId = `${id}-title`
  return (
    <section className="card health-problem" aria-labelledby={titleId}>
      <h1 id={titleId} ref={ref} tabIndex={-1}>{title}</h1>
      <p>{body}</p>
      <Link href={href} className="btn primary">{action}</Link>
    </section>
  )
}

/**
 * While the record a form opens with is read. `title`: the page heading
 * drawn already (the weight form); `size`: the height of the form to come,
 * so the page does not jump when it arrives.
 */
export function FormSkeleton({ label, title, size = 'record' }: { label: string; title?: string; size?: 'record' | 'weight' }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {title && (
        <div className="pagehead" aria-hidden>
          <div>
            <h1>{title}</h1>
          </div>
        </div>
      )}
      <div className={`skeleton-block record-form ${size === 'weight' ? 'weight-skeleton-form' : 'event-skeleton-form'}`} aria-hidden />
    </div>
  )
}
