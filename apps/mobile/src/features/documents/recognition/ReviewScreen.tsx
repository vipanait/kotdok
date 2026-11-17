import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, BackHandler, StyleSheet, View, type ScrollView } from 'react-native'
import { useFocusEffect } from 'expo-router'
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
import { useText } from '@/i18n'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'
import type { DocumentFormat } from '../document-view'
import { DocumentLine, Notice } from '../parts'
import { EntryEdit } from './EntryEdit'
import { ReviewEntry } from './ReviewEntry'
import { editChanged, editStateOf, selectionAfterEdit, type EditState } from './recognition-view'

/**
 * The review of a recognised document (design run «review», «mismatch»,
 * «recipe», «edit», «discard»), as one screen of the app's own layout: the
 * suggestions in groups — Прививки, Обработки, Лекарства, no empty group —
 * each with a checkbox, «Изменить» and «Страница N»; the confident complete
 * ones ticked, unsure ones and possible duplicates not (`initialSelection`).
 * The counter on «Добавить выбранное» is what will be sent, and none
 * disables it. Another pet's name in the document is a warning, never a
 * switch of pet.
 *
 * «Изменить» swaps the list for the entry's edit («← К проверке») on the
 * same screen and back: the list returns where it was scrolled, with the
 * focus on that entry's «Изменить». A page of the original is pushed over
 * this screen (`onOpenPage`), so everything here — selection, edits, an open
 * edit with what was typed, the scroll — is simply still here on the way
 * back. Leaving with changes asks first (the app's unsaved-changes guard) —
 * not the same as «Не добавлять записи», which discards the server's draft.
 *
 * Nothing here calls the API: the screen is handed what to send to
 * (`onConfirm`, `onDiscard`), which DOC-2 will wire to `POST …/confirm` and
 * `DELETE …/recognition`.
 */
export function ReviewScreen({
  petName,
  species,
  today,
  document: doc,
  draft,
  onBack,
  onOpenPage,
  onOpenRecord,
  onConfirm,
  onSaved,
  onDiscard,
  onDiscarded,
  initial: opening,
  top,
}: {
  petName: string
  species: PetSpecies
  /** The owner's day: no next date in the past is sent. */
  today: string
  document: { id: string; title: string; format: DocumentFormat }
  draft: RecognitionDraft
  /** «← Документы». */
  onBack: () => void
  /** A page of the original, pushed over this screen; `from` names the way back («К проверке», «К правке»). */
  onOpenPage: (page: number, from: 'review' | 'edit') => void
  /** The existing record a duplicate matches. */
  onOpenRecord?: (recordId: string) => void
  /**
   * «Добавить выбранное»: DOC-2 `POST …/confirm` with an idempotency key the
   * caller keeps across retries. Resolves once saved; a rejection keeps
   * everything on screen with a retry.
   */
  onConfirm: (body: ConfirmBody) => Promise<void>
  /** After a save, with the guard lifted: on to what was saved. */
  onSaved: () => void
  /** «Не добавлять»: DOC-2 `DELETE …/recognition`; the file stays. */
  onDiscard: () => Promise<void>
  onDiscarded: () => void
  /** How it opens: an entry's edit, or the discard question. */
  initial?: { edit?: string; discard?: boolean }
  /** Above everything (the developer screen's «Тестовые данные»). */
  top?: ReactNode
}) {
  const t = useText()
  const words = t.documents.recognition.review
  const editWords = t.documents.recognition.edit

  const [initial] = useState(() => initialSelection(draft))
  const [selection, setSelection] = useState<Selection>(initial)
  const [edits, setEdits] = useState<EntryEdits>({})
  const [editing, setEditing] = useState<EditState | null>(() => {
    const opened = opening?.edit ? draft.entries.find((entry) => entry.key === opening.edit) : undefined
    return opened ? editStateOf(opened) : null
  })
  const [askingEdit, setAskingEdit] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(false)
  const [discarding, setDiscarding] = useState<'asking' | 'busy' | null>(opening?.discard ? 'asking' : null)
  const [discardError, setDiscardError] = useState(false)

  const scroller = useRef<ScrollView | null>(null)
  /** Where the list stands as it scrolls, and where it stood when an edit opened. */
  const listY = useRef(0)
  const savedY = useRef(0)
  /** The way back from an edit, done once the list has laid out again: its scroll, and the entry to focus. */
  const returning = useRef<{ key: string; y: number } | null>(null)
  const editRefs = useRef(new Map<string, View | null>())
  const inFlight = useRef(false)

  const entries = draft.entries.map((entry) => currentEntry(entry, edits))
  const count = selectedCount(draft, edits, selection)
  const editingEntry = editing ? (entries.find((entry) => entry.key === editing.key) ?? null) : null
  const editInitial = editingEntry ? editStateOf(editingEntry) : null
  const editDirty = Boolean(editing && editInitial && editChanged(editInitial, editing))
  const dirty = JSON.stringify(selection) !== JSON.stringify(initial) || Object.keys(edits).length > 0 || editDirty
  const unsaved = useUnsavedChanges(dirty && !confirming && discarding !== 'busy')

  function openEdit(entry: DraftEntry) {
    // Before anything moves the scroller: the edit starts at the top.
    savedY.current = listY.current
    setEditing(editStateOf(entry))
    scroller.current?.scrollTo({ y: 0, animated: false })
  }

  function closeEdit(key: string) {
    setAskingEdit(false)
    returning.current = { key, y: savedY.current }
    setEditing(null)
  }

  /** The list has laid out again after an edit: back where it was, the focus on that entry's «Изменить». */
  function restoreList() {
    const back = returning.current
    if (!back) return
    returning.current = null
    scroller.current?.scrollTo({ y: back.y, animated: false })
    listY.current = back.y
    const node = editRefs.current.get(back.key)
    if (node) AccessibilityInfo.sendAccessibilityEvent(node, 'focus')
  }

  /** «← К проверке» and «Отмена»: straight back when nothing changed, a question otherwise. */
  function leaveEdit() {
    if (!editing) return
    if (editDirty) setAskingEdit(true)
    else closeEdit(editing.key)
  }

  // The hardware back on an edit goes back to the list, as «← К проверке» does —
  // only while this screen is in front: with the original pushed over the
  // edit, back closes the original.
  const leaveEditNow = useRef(leaveEdit)
  useEffect(() => {
    leaveEditNow.current = leaveEdit
  })
  const isEditing = editing !== null
  useFocusEffect(
    useCallback(() => {
      if (!isEditing) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        leaveEditNow.current()
        return true
      })
      return () => sub.remove()
    }, [isEditing]),
  )

  async function confirm() {
    if (inFlight.current || count === 0) return
    inFlight.current = true
    setConfirming(true)
    setConfirmError(false)
    try {
      await onConfirm(confirmBody(draft, edits, selection, today))
      unsaved.leave(onSaved)
    } catch {
      inFlight.current = false
      setConfirming(false)
      setConfirmError(true)
      AccessibilityInfo.announceForAccessibility(words.confirmFailed)
    }
  }

  async function discard() {
    setDiscarding('busy')
    setDiscardError(false)
    try {
      await onDiscard()
      unsaved.leave(onDiscarded)
      setDiscarding(null)
    } catch {
      setDiscarding(null)
      setDiscardError(true)
    }
  }

  const leaveDialog = (
    <ConfirmDialog
      visible={unsaved.pending !== null}
      title={words.leaveTitle}
      message={words.leaveBody}
      confirmTitle={words.leaveConfirm}
      cancelTitle={words.leaveStay}
      onConfirm={() => unsaved.pending && unsaved.leave(unsaved.pending)}
      onCancel={unsaved.stay}
    />
  )

  // One screen for the list and the edit: the scroller stays, so the list can be put back where it was.
  const editingNow = editing && editingEntry ? { state: editing, entry: editingEntry } : null
  const mismatch = petNameMismatch(draft.pet_name_as_written, petName)

  return (
    <Screen
      title={editingNow ? editWords.title[editingNow.entry.type] : words.title}
      subtitle={editingNow ? editWords.fromPage(editingNow.entry.page) : `${doc.title} · ${words.found(draft.entries.length)}`}
      backLabel={editingNow ? editWords.back : t.documents.backToList}
      onBack={editingNow ? leaveEdit : onBack}
      scroll
      scrollRef={scroller}
      onScrollY={(y) => {
        if (!editing && !returning.current) listY.current = y
      }}
      dock={
        editingNow ? null : (
          <View style={styles.dock}>
            <Button title={words.confirm(count)} disabled={count === 0} busy={confirming} onPress={() => void confirm()} />
            <Text variant="caption" tone="muted" center>
              {count === 0 ? words.noneSelected : words.confirmHint}
            </Text>
          </View>
        )
      }
    >
      {top}
      {editingNow ? (
        <EntryEdit
          key={editingNow.state.key}
          entry={editingNow.entry}
          state={editingNow.state}
          species={species}
          today={today}
          onOpenPage={() => onOpenPage(editingNow.entry.page, 'edit')}
          onStateChange={setEditing}
          onDone={(entry) => {
            const nextEdits = { ...edits, [entry.key]: entry }
            setEdits(nextEdits)
            setSelection(settleSelection(draft, nextEdits, selectionAfterEdit(selection, entry)))
            closeEdit(entry.key)
          }}
          onCancel={leaveEdit}
        />
      ) : (
        // A new view after every edit: its first layout is when the list can go back where it was.
        <View onLayout={restoreList}>
          {mismatch ? (
            <Notice tone="error" title={words.mismatchTitle(draft.pet_name_as_written ?? '')} body={words.mismatchBody(petName)} />
          ) : (
            <Notice title={words.introTitle} body={words.introBody} />
          )}

          <DocumentLine
            format={doc.format}
            title={words.openOriginal}
            meta={doc.title}
            label={`${words.openOriginal}, ${doc.title}`}
            onPress={() => onOpenPage(1, 'review')}
          />

          {reviewGroups(entries).map((group) => (
            <View key={group.section} style={styles.group}>
              <View style={styles.groupHead}>
                <Text variant="h2" accessibilityRole="header" style={styles.fill}>
                  {words.groups[group.section]}
                </Text>
                <Text variant="label" tone="muted">
                  {words.groupCount(group.entries.length)}
                </Text>
              </View>
              {group.entries.map((entry) => (
                <ReviewEntry
                  key={entry.key}
                  entry={entry}
                  selected={Boolean(selection[entry.key])}
                  onToggle={(on) => setSelection((current) => ({ ...current, [entry.key]: on }))}
                  onEdit={() => openEdit(entry)}
                  onOpenPage={() => onOpenPage(entry.page, 'review')}
                  onOpenRecord={onOpenRecord}
                  editRef={(node) => {
                    editRefs.current.set(entry.key, node)
                  }}
                />
              ))}
              {group.section === 'medications' ? (
                <Text variant="caption" tone="faint">
                  {words.doctorNote}
                </Text>
              ) : null}
            </View>
          ))}

          {confirmError ? <Banner text={words.confirmFailed} tone="error" style={styles.gap} /> : null}
          {discardError ? <Banner text={t.documents.recognition.discard.failed} tone="error" style={styles.gap} /> : null}
          <LinkButton
            title={words.discard}
            onPress={() => {
              setDiscardError(false)
              setDiscarding('asking')
            }}
          />
        </View>
      )}

      <ConfirmDialog
        visible={discarding !== null}
        title={t.documents.recognition.discard.title}
        message={t.documents.recognition.discard.body}
        confirmTitle={t.documents.recognition.discard.confirm}
        cancelTitle={t.documents.recognition.discard.stay}
        busy={discarding === 'busy'}
        onConfirm={() => void discard()}
        onCancel={() => setDiscarding(null)}
      />
      <ConfirmDialog
        visible={askingEdit}
        title={editWords.leaveTitle}
        message={editWords.leaveBody}
        confirmTitle={editWords.leaveConfirm}
        cancelTitle={editWords.leaveStay}
        onConfirm={() => editing && closeEdit(editing.key)}
        onCancel={() => setAskingEdit(false)}
      />
      {leaveDialog}
    </Screen>
  )
}

const styles = StyleSheet.create({
  dock: { gap: 6 },
  group: { marginTop: space.block, gap: 0 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.row, marginBottom: space.row },
  fill: { flex: 1 },
  gap: { marginTop: space.row },
})
