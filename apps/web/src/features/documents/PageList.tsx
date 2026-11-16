'use client'

import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import type { PreparedPage } from './prepare-pages'

/** A page chosen for a new document, with its preview (an object URL; none for a PDF). */
export type ChosenPage = PreparedPage & { id: string; preview: string | null }

/**
 * The pages of a document being added, in the order they will be saved:
 * each can go a place up or down, or be taken out. The buttons name their
 * page («Страницу 2 выше») for a screen reader.
 */
export default function PageList({
  pages,
  disabled,
  onMove,
  onRemove,
}: {
  pages: ChosenPage[]
  disabled: boolean
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (index: number) => void
}) {
  const words = useTranslations().documents.upload
  const label = (template: string, index: number) => template.replace('{n}', String(index + 1))
  return (
    <ol className="document-pages">
      {pages.map((page, index) => (
        <li key={page.id} className="document-page">
          <span className="document-thumb" aria-hidden>
            {page.preview ? (
              // A local object URL of the picked file, never fetched from anywhere.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.preview} alt="" />
            ) : (
              <span className="document-thumb-pdf">PDF</span>
            )}
          </span>
          <span className="document-page-name">
            <strong>{label(words.pageN, index)}</strong>
            <small>{page.name}</small>
          </span>
          <span className="document-page-actions">
            {pages.length > 1 && (
              <>
                <button
                  type="button"
                  className="btn secondary compact"
                  aria-label={label(words.moveUp, index)}
                  disabled={disabled || index === 0}
                  onClick={() => onMove(index, -1)}
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  className="btn secondary compact"
                  aria-label={label(words.moveDown, index)}
                  disabled={disabled || index === pages.length - 1}
                  onClick={() => onMove(index, 1)}
                >
                  <span aria-hidden>↓</span>
                </button>
              </>
            )}
            <button type="button" className="btn secondary compact" aria-label={label(words.remove, index)} disabled={disabled} onClick={() => onRemove(index)}>
              <Icon name="close" />
            </button>
          </span>
        </li>
      ))}
    </ol>
  )
}
