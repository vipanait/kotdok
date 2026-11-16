import Link from 'next/link'
import { vocab } from '@lapka/shared'
import { publishedEntries } from './load'

/** The section of /o-materialah that explains the reference; the page renders it only once an entry is published. */
export const SAFETY_ABOUT_HREF = '/o-materialah#mozhno-li'

/**
 * Where «О материалах» leads: the reference's section once /o-materialah
 * renders it (an entry is published — the page's own check), the page itself
 * before that, so the link never points at an anchor that is not there.
 */
export function safetyAboutHref(): string {
  return publishedEntries().length > 0 ? SAFETY_ABOUT_HREF : '/o-materialah'
}

/**
 * The close of a «Можно ли» page (handoff §8): the short caption and, on a
 * line of its own under it, «О материалах» — a tall link, not a break in the
 * sentence (handoff, «Уточнение: поиск…») — which leads to the full
 * explanation on /o-materialah instead of repeating it under every section.
 */
export default function SafetyFootnote({ className }: { className?: string }) {
  const t = vocab.ru.safetyAbout
  return (
    <div className={className ? `safety-footnote ${className}` : 'safety-footnote'}>
      <p className="footnote">{t.caption}</p>
      <Link href={safetyAboutHref()} className="safety-footnote-link">{t.action}</Link>
    </div>
  )
}
