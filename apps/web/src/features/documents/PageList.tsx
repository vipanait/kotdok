'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { focusAfterMove, type PreparedPage } from './prepare-pages'

/** A page chosen for a new document, with a local object URL of its file to open it. */
export type ChosenPage = PreparedPage & { id: string; preview: string }

type Focus = { index: number; action: 'up' | 'down' | 'remove' } | { index: -1; action: 'none' }

/**
 * The pages of a document being added, top to bottom in the order they will
 * be sent: the number, the file's own name, a press to open it (a photo
 * large here, a PDF in a new tab), and «Выше», «Ниже», «Удалить» named with
 * their page for a screen reader. After a move or a removal focus stays on
 * the same kind of action, so the keyboard does not fall to the page start.
 */
export default function PageList({
  pages,
  disabled,
  onOpen,
  onMove,
  onRemove,
  onEmptied,
}: {
  pages: ChosenPage[]
  disabled: boolean
  onOpen: (index: number) => void
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (index: number) => void
  /** The last page went: where focus should go instead. */
  onEmptied: () => void
}) {
  const words = useTranslations().documents.upload
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const pending = useRef<Focus | null>(null)

  useEffect(() => {
    const focus = pending.current
    if (!focus) return
    pending.current = null
    if (focus.action === 'none') {
      onEmptied()
      return
    }
    const page = pages[focus.index]
    if (page) buttons.current.get(`${page.id}:${focus.action}`)?.focus()
  }, [pages, onEmptied])

  const fill = (template: string, index: number, page: ChosenPage) => template.replace('{n}', String(index + 1)).replace('{name}', page.name)
  const register = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) buttons.current.set(key, node)
    else buttons.current.delete(key)
  }

  function move(index: number, delta: -1 | 1) {
    pending.current = focusAfterMove(index, delta, pages.length)
    onMove(index, delta)
  }

  function remove(index: number) {
    const left = pages.length - 1
    pending.current = left === 0 ? { index: -1, action: 'none' } : { index: Math.min(index, left - 1), action: 'remove' }
    onRemove(index)
  }

  return (
    <ol className="document-pages">
      {pages.map((page, index) => {
        const name = (
          <>
            <span className="document-page-number" aria-hidden>{index + 1}</span>
            <span className="document-page-name">
              <strong>{words.pageN.replace('{n}', String(index + 1))}</strong>
              <small>{page.name}</small>
            </span>
            <Icon name="chevron" />
          </>
        )
        return (
          <li key={page.id} className="document-page">
            {page.contentType === 'application/pdf' ? (
              <a className="document-page-open" href={page.preview} target="_blank" rel="noopener noreferrer" aria-label={fill(words.open, index, page)}>
                {name}
              </a>
            ) : (
              <button type="button" className="document-page-open" aria-label={fill(words.open, index, page)} onClick={() => onOpen(index)}>
                {name}
              </button>
            )}
            <span className="document-page-actions">
              {pages.length > 1 && index > 0 && (
                <button ref={register(`${page.id}:up`)} type="button" className="link" aria-label={fill(words.moveUpLabel, index, page)} disabled={disabled} onClick={() => move(index, -1)}>
                  {words.moveUp}
                </button>
              )}
              {pages.length > 1 && index < pages.length - 1 && (
                <button ref={register(`${page.id}:down`)} type="button" className="link" aria-label={fill(words.moveDownLabel, index, page)} disabled={disabled} onClick={() => move(index, 1)}>
                  {words.moveDown}
                </button>
              )}
              <button ref={register(`${page.id}:remove`)} type="button" className="link danger" aria-label={fill(words.removeLabel, index, page)} disabled={disabled} onClick={() => remove(index)}>
                {words.remove}
              </button>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
