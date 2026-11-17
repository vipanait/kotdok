'use client'

import Link from 'next/link'
import { savedMerged, type SavedGroup } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import SavedNotice from '@/features/medical-record/SavedNotice'
import { formatCount } from '@/shared/i18n/plural'
import { SourceLine } from './SourceLine'

/**
 * «Записи в медкарте»: what was actually saved — records per section, never
 * the count selected, since two vaccines of one day may be one record — no
 * empty groups, the one source document, and «Готово» to the medical record.
 */
export default function ConfirmedSummary({
  groups,
  source,
  doneHref,
}: {
  /** `savedSummary` of what the server answered. */
  groups: SavedGroup[]
  source: { title: string; href: string }
  doneHref: string
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.documents.recognition
  return (
    <div className="recognition-confirmed">
      <SavedNotice text={`${words.confirmed.notice}. ${words.confirmed.body}`} />
      <ul className="recognition-saved">
        {groups.map((group) => (
          <li key={group.section}>
            <strong>{words.review.groups[group.section]}</strong>
            <span>{formatCount(group.section === 'medications' ? words.confirmed.courses : words.confirmed.records, group.records, locale)}</span>
          </li>
        ))}
      </ul>
      {savedMerged(groups) && <p className="field-hint">{words.confirmed.merged}</p>}
      <SourceLine title={source.title} href={source.href} />
      <div className="recognition-actions">
        <Link href={doneHref} className="btn primary">
          {words.confirmed.done}
        </Link>
      </div>
    </div>
  )
}
