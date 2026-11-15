import Link from 'next/link'
import { vocab } from '@lapka/shared'

/** The section of /o-materialah that explains the reference; the page renders it only once an entry is published. */
export const SAFETY_ABOUT_HREF = '/o-materialah#mozhno-li'

/**
 * The one line under a «Можно ли» page (handoff §8): the short caption and
 * «О материалах», which leads to the full explanation on /o-materialah
 * instead of repeating it under every section.
 */
export default function SafetyFootnote({ className }: { className?: string }) {
  const t = vocab.ru.safetyAbout
  return (
    <p className={className ? `footnote safety-footnote ${className}` : 'footnote safety-footnote'}>
      {t.caption}{' '}
      <Link href={SAFETY_ABOUT_HREF} className="link">{t.action}</Link>
    </p>
  )
}
