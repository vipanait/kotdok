import Link from 'next/link'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/**
 * A case that is not there to show: someone else's, one whose pet or check
 * was deleted, a malformed link. Nothing of the case is said, only that it
 * was not found — the same for each, so a link cannot tell them apart.
 */
export default function CaseNotFound({ dict }: { dict: Dictionary }) {
  const words = dict.followup
  return (
    <section className="card followup-problem" aria-labelledby="followup-not-found">
      <h1 id="followup-not-found">{words.notFoundTitle}</h1>
      <p>{words.notFoundBody}</p>
      <Link href="/pets" className="btn primary">{words.toPets}</Link>
    </section>
  )
}
