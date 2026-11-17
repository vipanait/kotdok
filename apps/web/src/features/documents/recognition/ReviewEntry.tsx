'use client'

import Link from 'next/link'
import type { DraftEntry } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { entryRow, reviewIds } from './recognition-view'

/**
 * One suggested record (design run «review», «recipe»): a native checkbox
 * labelled with its name, the day, the essentials, what is unsure, what is
 * missing — said next to the entry — and a possible duplicate pointing at
 * the real record when the server named it. «Изменить» opens it with its
 * values; «Страница N» the page of the original it was read from.
 */
export default function ReviewEntry({
  entry,
  selected,
  originalHref,
  recordHref,
  onToggle,
  onEdit,
  onOpenOriginal,
}: {
  entry: DraftEntry
  selected: boolean
  originalHref: string
  /** The existing record a duplicate matches, when the server identified it. */
  recordHref: (recordId: string) => string | null
  onToggle: (on: boolean) => void
  onEdit: () => void
  onOpenOriginal: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void
}) {
  const dict = useTranslations()
  const words = dict.documents.recognition.review
  const row = entryRow(dict, entry)
  const checkboxId = reviewIds.checkbox(entry.key)
  const problemsId = `${checkboxId}-problems`
  const duplicateHref = row.duplicate?.recordId ? recordHref(row.duplicate.recordId) : null

  return (
    <li className={selected ? 'recognition-entry is-selected' : 'recognition-entry'}>
      <input
        id={checkboxId}
        type="checkbox"
        className="recognition-check"
        checked={selected}
        disabled={!row.selectable}
        aria-describedby={row.missing.length > 0 || row.unsure || row.duplicate ? problemsId : undefined}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <div className="recognition-entry-body">
        <label htmlFor={checkboxId} className="recognition-entry-name">
          <span className="sr-only">{words.select.replace('{name}', '')}</span>
          <strong className={row.named ? undefined : 'is-missing'}>{row.title}</strong>
        </label>
        <p className={row.date.missing ? 'recognition-entry-meta is-missing' : 'recognition-entry-meta'}>{row.date.text}</p>
        {row.details.map((line) => (
          <p key={line} className="recognition-entry-meta">{line}</p>
        ))}
        <div id={problemsId} className="recognition-entry-flags">
          {row.unsure && (
            <p>
              <span className="document-status">{words.unsure}</span> {row.unsure}
            </p>
          )}
          {row.missing.map((text) => (
            <p key={text} className="field-error">{text}</p>
          ))}
          {row.duplicate && (
            <p>
              <span className="document-status">{row.duplicate.text}</span>
              {duplicateHref && (
                <>
                  {' '}
                  <Link href={duplicateHref} className="link">{words.duplicateOpen}</Link>
                </>
              )}
            </p>
          )}
        </div>
        <div className="recognition-entry-links">
          <button id={reviewIds.edit(entry.key)} type="button" className="link" aria-label={words.editLabel.replace('{name}', row.title)} onClick={onEdit}>
            {words.edit}
          </button>
          <Link
            id={reviewIds.page(entry.key)}
            href={originalHref}
            className="link"
            aria-label={words.pageLabel.replace('{n}', String(entry.page)).replace('{name}', row.title)}
            onClick={(e) => onOpenOriginal(e, originalHref)}
          >
            {words.page.replace('{n}', String(entry.page))}
          </Link>
        </div>
      </div>
    </li>
  )
}
