'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import type { PetSpecies } from '@lapka/contracts'
import {
  confirmBody,
  currentEntry,
  initialSelection,
  petNameMismatch,
  reviewGroups,
  selectedCount,
  settleSelection,
  type ConfirmBody,
  type DraftEntry,
  type EntryEdits,
  type RecognitionDraft,
  type Selection,
} from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { formatCount } from '@/shared/i18n/plural'
import DiscardConfirm from './DiscardConfirm'
import EntryEdit from './EntryEdit'
import ReviewEntry from './ReviewEntry'
import { editStateOf, readReviewMemory, reviewIds, reviewMemoryKey, selectionAfterEdit, type EditState, type ReviewMemory } from './recognition-view'

type Props = {
  petName: string
  species: PetSpecies
  /** The owner's day: no next date in the past is sent. */
  today: string
  document: { id: string; title: string }
  draft: RecognitionDraft
  /** `← Документы`. */
  backHref: string
  /** A page of the original, returning here: `from` is the review, or the edit of `editKey`. */
  originalHref: (page: number, from: 'review' | 'edit', editKey?: string) => string
  /** The existing record a duplicate matches. */
  recordHref: (recordId: string) => string | null
  /**
   * «Добавить выбранное»: DOC-2 `POST …/confirm` with an idempotency key the
   * caller keeps across retries. Resolves once saved; a rejection keeps
   * everything on screen with a retry.
   */
  onConfirm: (body: ConfirmBody) => Promise<void>
  /** «Не добавлять»: DOC-2 `DELETE …/recognition`; the file stays. */
  onDiscard: () => Promise<void>
  /** How it opens when nothing was kept: an entry's edit (`?edit=`), or the discard question. */
  initial?: { edit?: string; discard?: boolean }
}

const subscribeNothing = () => () => {}

/**
 * The review of a recognised document (design run «review», «mismatch»,
 * «recipe», «edit», «discard»): the suggestions in groups — Прививки,
 * Обработки, Лекарства, no empty group — each with a checkbox, «Изменить»
 * and «Страница N»; the confident complete ones ticked, unsure ones and
 * possible duplicates not (`initialSelection`). The counter on «Добавить
 * выбранное» is what will be sent, and none disables it. Another pet's name
 * in the document is a warning, never a switch of pet.
 *
 * Edits stay on the device until confirmed. A trip to the original keeps
 * the selection, the edits, an open edit with what was typed, the scroll
 * and the focus (sessionStorage, read once on the way back). Leaving
 * elsewhere with changes asks first (the app's leave guard) — not the same
 * as «Не добавлять записи», which discards the server's draft.
 */
export default function ReviewScreen(props: Props) {
  // The memory is the browser's: the server renders without it, the client
  // reads it once mounted (a remount, not an effect setting state).
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false)
  return <ReviewBody key={hydrated ? 'client' : 'server'} {...props} restore={hydrated} />
}

function loadMemory(docId: string, keys: string[]): ReviewMemory | null {
  try {
    return readReviewMemory(window.sessionStorage.getItem(reviewMemoryKey(docId)), docId, keys)
  } catch {
    return null
  }
}

function ReviewBody({
  petName,
  species,
  today,
  document: doc,
  draft,
  backHref,
  originalHref,
  recordHref,
  onConfirm,
  onDiscard,
  initial: opening,
  restore,
}: Props & { restore: boolean }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.documents.recognition.review

  const [initial] = useState(() => initialSelection(draft))
  const [memory] = useState(() => (restore ? loadMemory(doc.id, draft.entries.map((entry) => entry.key)) : null))
  const [selection, setSelection] = useState<Selection>(() => (memory ? { ...initial, ...memory.selection } : initial))
  const [edits, setEdits] = useState<EntryEdits>(() => memory?.edits ?? {})
  const [editing, setEditing] = useState<EditState | null>(() => {
    if (memory) return memory.editing
    const opened = opening?.edit ? draft.entries.find((entry) => entry.key === opening.edit) : undefined
    return opened ? editStateOf(opened) : null
  })
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(false)
  const [discarding, setDiscarding] = useState<'asking' | 'busy' | null>(() => (opening?.discard && !memory ? 'asking' : null))
  const [discardError, setDiscardError] = useState<string | undefined>()
  const [returnTo, setReturnTo] = useState<{ id: string; scrollY: number; n: number } | null>(null)
  const listScroll = useRef(0)
  const discardRef = useRef<HTMLButtonElement>(null)
  const inFlight = useRef(false)

  const entries = draft.entries.map((entry) => currentEntry(entry, edits))
  const count = selectedCount(draft, edits, selection)
  const editingEntry = editing ? (entries.find((entry) => entry.key === editing.key) ?? null) : null
  const editInitial = editingEntry ? editStateOf(editingEntry) : null
  const editDirty = Boolean(editing && editInitial && JSON.stringify(editing.form) !== JSON.stringify(editInitial.form))
  const dirty = JSON.stringify(selection) !== JSON.stringify(initial) || Object.keys(edits).length > 0 || editDirty
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !confirming, backHref)

  // Back from the original: where the list was, and the control that took the owner there.
  useEffect(() => {
    if (!memory) return
    try {
      window.sessionStorage.removeItem(reviewMemoryKey(doc.id))
    } catch {
      // Nothing kept.
    }
    window.scrollTo(0, memory.scrollY)
    if (memory.focusId) document.getElementById(memory.focusId)?.focus({ preventScroll: true })
  }, [memory, doc.id])

  // Back from an edit: the list where it was, focus on that entry's «Изменить».
  useEffect(() => {
    if (!returnTo) return
    window.scrollTo(0, returnTo.scrollY)
    document.getElementById(returnTo.id)?.focus({ preventScroll: true })
  }, [returnTo])

  function openOriginal(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const kept: ReviewMemory = {
      docId: doc.id,
      selection,
      edits,
      editing,
      scrollY: window.scrollY,
      focusId: event.currentTarget.id || null,
    }
    try {
      window.sessionStorage.setItem(reviewMemoryKey(doc.id), JSON.stringify(kept))
    } catch {
      // No storage (a private window): the review opens as the server left it.
    }
    // Everything is kept: going to the original is not leaving the review.
    leave(href)
  }

  function openEdit(entry: DraftEntry) {
    listScroll.current = window.scrollY
    setEditing(editStateOf(entry))
    window.scrollTo(0, 0)
  }

  function closeEdit(key: string) {
    setEditing(null)
    setReturnTo((current) => ({ id: reviewIds.edit(key), scrollY: listScroll.current, n: (current?.n ?? 0) + 1 }))
  }

  async function confirm() {
    if (inFlight.current || count === 0) return
    inFlight.current = true
    setConfirming(true)
    setConfirmError(false)
    try {
      await onConfirm(confirmBody(draft, edits, selection, today))
    } catch {
      inFlight.current = false
      setConfirming(false)
      setConfirmError(true)
    }
  }

  async function discard() {
    setDiscarding('busy')
    setDiscardError(undefined)
    try {
      await onDiscard()
    } catch {
      setDiscarding('asking')
      setDiscardError(dict.documents.recognition.discard.failed)
    }
  }

  const guardDialog = leaveHref && (
    <ConfirmDialog
      title={words.leaveTitle}
      body={words.leaveBody}
      cancelLabel={words.leaveStay}
      confirmLabel={words.leaveConfirm}
      className="document-confirm"
      onCancel={stay}
      onConfirm={() => leave(leaveHref)}
      returnFocusRef={leaveLinkRef}
    />
  )

  if (editing && editingEntry && editInitial) {
    return (
      <div className="health-page recognition-page">
        <EntryEdit
          key={editing.key}
          entry={editingEntry}
          state={editing}
          initial={editInitial}
          species={species}
          today={today}
          originalHref={originalHref(editingEntry.page, 'edit', editingEntry.key)}
          onOpenOriginal={openOriginal}
          onStateChange={setEditing}
          onDone={(entry) => {
            const nextEdits = { ...edits, [entry.key]: entry }
            setEdits(nextEdits)
            setSelection(settleSelection(draft, nextEdits, selectionAfterEdit(selection, entry)))
            closeEdit(entry.key)
          }}
          onCancel={() => closeEdit(editing.key)}
        />
        {guardDialog}
      </div>
    )
  }

  const mismatch = petNameMismatch(draft.pet_name_as_written, petName)
  const found = formatCount(words.found, draft.entries.length, locale)

  return (
    <div className="health-page recognition-page">
      <Link href={backHref} className="link health-back">
        <Icon name="back" />
        {dict.documents.view.backToList}
      </Link>
      <div className="pagehead">
        <div>
          <h1 className="document-heading">{words.title}</h1>
          <p className="document-subtitle">{`${doc.title} · ${found}`}</p>
        </div>
      </div>

      <div className="section-layout document-layout">
        <div className="section-main document-main">
          {mismatch ? (
            <div className="banner error document-alert recognition-mismatch" role="note">
              <strong>{words.mismatchTitle.replace('{name}', draft.pet_name_as_written ?? '')}</strong>
              <p>{words.mismatchBody.replace('{pet}', petName)}</p>
            </div>
          ) : (
            <div className="banner document-alert">
              <strong>{words.introTitle}</strong>
              <p>{words.introBody}</p>
            </div>
          )}

          <Link href={originalHref(1, 'review')} className="document-row document-original no-format" onClick={(e) => openOriginal(e, originalHref(1, 'review'))} id="recognition-original">
            <span className="document-row-text">
              <strong>{words.openOriginal}</strong>
              <small>{doc.title}</small>
            </span>
            <Icon name="chevron" />
          </Link>

          {reviewGroups(entries).map((group) => (
            <section key={group.section} className="recognition-group" aria-labelledby={`recognition-group-${group.section}`}>
              <div className="recognition-group-head">
                <h2 id={`recognition-group-${group.section}`}>{words.groups[group.section]}</h2>
                <span>{formatCount(words.groupCount, group.entries.length, locale)}</span>
              </div>
              <ul className="recognition-entries">
                {group.entries.map((entry) => (
                  <ReviewEntry
                    key={entry.key}
                    entry={entry}
                    selected={Boolean(selection[entry.key])}
                    originalHref={originalHref(entry.page, 'review')}
                    recordHref={recordHref}
                    onToggle={(on) => setSelection((current) => ({ ...current, [entry.key]: on }))}
                    onEdit={() => openEdit(entry)}
                    onOpenOriginal={openOriginal}
                  />
                ))}
              </ul>
              {group.section === 'medications' && <p className="field-hint recognition-doctor">{words.doctorNote}</p>}
            </section>
          ))}

          <div className="recognition-confirm">
            {confirmError && (
              <div className="banner error" role="alert">
                <p>{words.confirmFailed}</p>
              </div>
            )}
            <button
              type="button"
              className="btn primary recognition-main"
              disabled={count === 0}
              aria-disabled={confirming || undefined}
              aria-describedby="recognition-confirm-hint"
              onClick={confirm}
            >
              {confirming ? words.confirming : words.confirm.replace('{n}', String(count))}
            </button>
            <p id="recognition-confirm-hint" className="field-hint">{count === 0 ? words.noneSelected : words.confirmHint}</p>
            <button
              ref={discardRef}
              type="button"
              className="link recognition-discard"
              onClick={() => {
                setDiscardError(undefined)
                setDiscarding('asking')
              }}
            >
              {words.discard}
            </button>
          </div>
        </div>

        <aside className="section-aside document-aside">
          <h2>{words.asideTitle}</h2>
          <p>{words.asideBody}</p>
        </aside>
      </div>

      {discarding && (
        <DiscardConfirm
          busy={discarding === 'busy'}
          error={discardError}
          onCancel={() => setDiscarding(null)}
          onConfirm={discard}
          returnFocusRef={discardRef}
        />
      )}
      {guardDialog}
    </div>
  )
}
