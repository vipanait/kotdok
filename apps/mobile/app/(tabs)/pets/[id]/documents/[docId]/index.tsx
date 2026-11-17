import { useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { DOCUMENT_LIMITS, type DocumentPatch, type PetDocument } from '@lapka/contracts'
import { apiFailure } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { dayInput, localToday, parseDayInput } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useCached, useInvalidate } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { openStoredPdf } from '@/features/documents/document-io'
import {
  documentFormat,
  documentHeadline,
  documentPages,
  documentRoute,
  documentTitle,
  isArchiveKind,
  pdfOpening,
  readDetails,
} from '@/features/documents/document-view'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { DocumentLine, Notice, Quiet, RecognitionOffer } from '@/features/documents/parts'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { DateField } from '@/ui/DateField'
import { ConfirmDialog, SaveChangesDialog } from '@/ui/Dialog'
import { Field } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { DetailSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, space } from '@/ui/theme'

/**
 * A stored document (DOC-1): «Документ сохранён» after an upload, the row
 * that opens the original, what an archive kind is kept as, the name and
 * date under «Название и дата», and delete behind a question that says the
 * records already in the medical record stay. The place where recognition
 * will be offered is `RecognitionOffer`, empty until the API says it is
 * available (R2).
 */
export default function StoredDocument() {
  const { id, docId, saved } = useLocalSearchParams<{ id: string; docId: string; saved?: string }>()
  const t = useText()
  const words = t.documents
  const invalidate = useInvalidate()

  const read = useCached(queryKeys.document(id, docId), () => withFreshSession((api) => api.getDocument(id, docId)))
  const doc = read.data?.id === docId ? read.data : null
  const gone = !doc && read.error !== null && apiFailure(read.error) === 'gone'
  const error = read.error ? describeFailure(t, read.error, words.view.loadFailed) : null

  const [notice, setNotice] = useState<'added' | 'changed' | null>(saved === 'added' ? 'added' : null)
  const [openFailed, setOpenFailed] = useState(false)
  // Archive kinds have nothing but the name and date to look at: open from the start.
  const [detailsToggled, setDetailsOpen] = useState<boolean | null>(null)
  // What the owner typed; until then the document's own values.
  const [typedTitle, setTitle] = useState<string | null>(null)
  const [typedDate, setDate] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const detailsOpen = detailsToggled ?? (doc !== null && isArchiveKind(doc.kind))
  const loadedDate = doc?.document_date ? dayInput(doc.document_date) : ''
  const title = typedTitle ?? doc?.title ?? ''
  const date = typedDate ?? loadedDate
  const detailsChanged = doc !== null && (title !== doc.title || date !== loadedDate)
  const unsaved = useUnsavedChanges(detailsChanged)

  const moved = () => invalidate([queryKeys.documents(id), queryKeys.document(id, docId)])

  /** @returns whether the details are saved (or there was nothing to save). */
  async function saveDetails(current: PetDocument): Promise<boolean> {
    const day = date.trim() === '' ? null : (parseDayInput(date) ?? 'invalid')
    const details = readDetails(current, title, day)
    if (!details.ok) {
      setTitleError(
        details.title === 'required'
          ? words.view.titleRequired
          : details.title === 'tooLong'
            ? words.view.titleTooLong(DOCUMENT_LIMITS.titleMax)
            : null,
      )
      setDateError(details.date ? words.view.dateInvalid : null)
      setDetailsOpen(true)
      return false
    }
    setTitleError(null)
    setDateError(null)
    const patch: DocumentPatch = details.patch
    if (Object.keys(patch).length === 0) {
      setTitle(null)
      setDate(null)
      return true
    }
    setSaving(true)
    setSaveError(null)
    try {
      await withFreshSession((api) => api.changeDocument(id, docId, patch))
      await moved()
      setTitle(null)
      setDate(null)
      setNotice('changed')
      setDetailsOpen(false)
      return true
    } catch (cause) {
      setSaveError(describeFailure(t, cause, words.view.saveFailed).text)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await withFreshSession((api) => api.deleteDocument(id, docId))
    } catch (cause) {
      // Already gone (another device): the same end.
      if (apiFailure(cause) !== 'gone') {
        setDeleting(false)
        setAsking(false)
        setDeleteError(describeFailure(t, cause, words.view.deleteFailed).text)
        return
      }
    }
    void invalidate([queryKeys.documents(id)])
    setAsking(false)
    setDeleting(false)
    // Typed changes go with the document; nothing to ask about on the way out.
    unsaved.leave(() => router.back())
  }

  if (!doc) {
    return (
      <Screen title={gone ? words.view.notFoundTitle : words.title} onBack={() => router.back()} backLabel={words.backToList} scroll>
        {gone ? (
          <Quiet title={words.view.notFoundTitle} body={words.view.notFoundBody}>
            <Button title={words.backToList} kind="secondary" onPress={() => router.back()} />
          </Quiet>
        ) : error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" busy={read.fetching} onPress={() => void read.reload()} />
          </>
        ) : (
          <DetailSkeleton facts={2} />
        )}
      </Screen>
    )
  }

  const format = documentFormat(doc)
  const name = documentTitle(t, doc)
  const pages = documentPages(t, doc)
  // The mark already says PDF on screen; the label says it once for a screen reader.
  const originalMeta =
    format === 'pdf'
      ? [pages, pdfOpening(Platform.OS) === 'download' ? words.view.pdfDownload : words.view.pdfSystem].filter(Boolean).join(' · ')
      : [pages, words.view.photos].filter(Boolean).join(' · ')

  const openOriginal = async () => {
    setOpenFailed(false)
    if (format === 'photo') {
      router.push(documentRoute.original(id, docId, { from: 'document' }))
      return
    }
    if (!(await openStoredPdf(doc.files[0]?.url ?? ''))) setOpenFailed(true)
  }

  return (
    <Screen
      title={name}
      titleLines={0}
      onBack={() => router.back()}
      backLabel={words.backToList}
      subtitle={documentHeadline(t, doc)}
      scroll
    >
      {notice ? <Notice title={words.saved[notice]} tone="success" /> : null}
      {error ? <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} /> : null}

      <DocumentLine
        format={format}
        title={words.view.openOriginal}
        meta={originalMeta}
        label={[words.view.openOriginal, words.format[format], originalMeta].filter(Boolean).join(', ')}
        onPress={() => void openOriginal()}
      />
      {openFailed ? <Banner text={words.view.openFailed} tone="error" /> : null}

      {isArchiveKind(doc.kind) ? (
        <View style={styles.block}>
          <Quiet title={words.view.archiveTitle} body={words.view.archiveBody[doc.kind]} />
        </View>
      ) : null}

      <RecognitionOffer doc={doc} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        accessibilityLabel={words.view.details}
        onPress={() => setDetailsOpen(!detailsOpen)}
        style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text variant="bodyStrong" tone="accent" style={styles.fill}>
          {words.view.details}
        </Text>
        <View style={detailsOpen ? styles.up : null}>
          <Icon name="down" size={20} color={colour.accentText} />
        </View>
      </Pressable>

      {detailsOpen ? (
        <View style={styles.details}>
          <Field
            label={words.view.titleField}
            value={title}
            onChangeText={setTitle}
            error={titleError}
            hint={doc.title.trim() === '' ? t.documents.upload.titleHint(t.documents.kinds[doc.kind]) : undefined}
            placeholder={doc.title.trim() === '' ? t.documents.kinds[doc.kind] : undefined}
            maxLength={DOCUMENT_LIMITS.titleMax}
            autoCorrect={false}
          />
          <DateField
            label={words.view.dateField}
            value={date}
            onChangeText={setDate}
            placeholder={t.medicalRecord.datePlaceholder}
            hint={words.view.dateHint}
            error={dateError}
            max={localToday()}
          />
          {saveError ? <Banner text={saveError} tone="error" /> : null}
          <Button title={words.view.save} busy={saving} onPress={() => void saveDetails(doc)} />
        </View>
      ) : null}

      <View style={styles.block}>
        {deleteError ? <Banner text={deleteError} tone="error" /> : null}
        <Button title={words.view.delete} kind="outlineDanger" onPress={() => setAsking(true)} />
      </View>

      <ConfirmDialog
        visible={asking}
        title={words.view.deleteTitle}
        message={words.view.deleteBody(name)}
        confirmTitle={words.view.deleteConfirm}
        cancelTitle={words.view.keep}
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />

      <SaveChangesDialog
        visible={unsaved.pending !== null}
        busy={saving}
        onSave={() => {
          const next = unsaved.pending
          unsaved.stay()
          void saveDetails(doc).then((done) => {
            if (done && next) unsaved.leave(next)
          })
        }}
        onDiscard={() => unsaved.pending && unsaved.leave(unsaved.pending)}
        onStay={unsaved.stay}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: space.block },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: TAP_TARGET, marginTop: space.block },
  fill: { flex: 1 },
  up: { transform: [{ rotate: '180deg' }] },
  details: { marginTop: space.row },
})
