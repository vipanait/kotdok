import { useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Image, Modal, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { DOCUMENT_LIMITS, type DocumentKind } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { useCached, useInvalidate } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { openLocalPdf, pdfPicker, pickFromCamera, pickFromLibrary, pickPdf, uploadDeps, type PickResult } from '@/features/documents/document-io'
import { documentRoute, limitsText, megabytes } from '@/features/documents/document-view'
import {
  NO_PAGES,
  addMoreMethods,
  addPages,
  draftChanged,
  isPdfPage,
  movePage,
  numberPages,
  pageCaption,
  photoRoom,
  pickMethods,
  removePage,
  type DraftPage,
  type PageProblem,
  type PagesDropped,
  type PickMethod,
} from '@/features/documents/page-list'
import { KindChoice, Notice, PageList } from '@/features/documents/parts'
import { uploadDocument, uploadFailure, uploadMessage, type UploadMessage, type UploadProgress } from '@/features/documents/upload-document'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Field } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { COLUMN_MAX_WIDTH, colour, radius, space } from '@/ui/theme'

/**
 * «Добавить документ» (DOC-1): the kind, then the pages — three buttons of
 * one height on a phone (`Снять документ`, `Из галереи`, `Выбрать PDF`; the
 * last only when this build has the PDF picker), then a vertical list of the
 * pages in the order they will be sent, an optional name, and «Сохранить
 * документ», off while there are no pages. Leaving with pages or a typed
 * name asks first.
 */
export default function AddDocument() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.documents.upload
  const invalidate = useInvalidate()

  const record = useCached(queryKeys.overview(id), () => withFreshSession((api) => api.getHealthOverview(id, localToday())))
  const petName = record.data && record.data.pet.id === id ? record.data.pet.name : null

  // Asked once: whether this installed app has the native PDF picker.
  const pdfAvailable = useMemo(() => pdfPicker() !== null, [])

  const [kind, setKind] = useState<DocumentKind | null>(null)
  const [kindError, setKindError] = useState(false)
  const [pages, setPages] = useState<DraftPage[]>([])
  const counters = useRef(NO_PAGES)
  const [title, setTitle] = useState('')
  const [picking, setPicking] = useState(false)
  const [dropped, setDropped] = useState<PagesDropped>(null)
  const [problems, setProblems] = useState<PageProblem[]>([])
  const [cameraDenied, setCameraDenied] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [message, setMessage] = useState<UploadMessage | null>(null)
  const [preview, setPreview] = useState<{ page: DraftPage; label: string } | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const busy = progress !== null
  // Set in the same tick as the press: a second tap before the next render does not start a second upload.
  const sending = useRef(false)
  const scroller = useRef<ScrollView>(null)

  const unsaved = useUnsavedChanges(draftChanged(pages, title))

  async function add(method: PickMethod) {
    setPicking(true)
    setDropped(null)
    setProblems([])
    setCameraDenied(false)
    setMessage(null)
    let result: PickResult
    try {
      result =
        method === 'camera' ? await pickFromCamera() : method === 'library' ? await pickFromLibrary(photoRoom(pages)) : await pickPdf()
    } catch {
      // The picker itself failed (rare): nothing was added, nothing to undo.
      result = { pages: [], problems: [] }
    } finally {
      setPicking(false)
    }
    setCameraDenied(result.denied === true)
    setProblems(result.problems)
    if (result.pages.length === 0) return
    const numbered = numberPages(result.pages, counters.current)
    counters.current = numbered.counters
    const next = addPages(pages, numbered.pages)
    setPages(next.pages)
    setDropped(next.dropped)
  }

  function move(index: number, delta: -1 | 1) {
    const next = movePage(pages, index, delta)
    setPages(next)
    // Said out loud: the list changed under the finger.
    const page = pages[index]
    if (page) AccessibilityInfo.announceForAccessibility(words.moved(index + delta + 1, pageCaption(t, page)))
  }

  function remove(index: number) {
    const page = pages[index]
    setPages(removePage(pages, index))
    setDropped(null)
    if (page) AccessibilityInfo.announceForAccessibility(words.removed(index + 1, pageCaption(t, page)))
  }

  async function open(page: DraftPage) {
    if (isPdfPage(page)) {
      await openLocalPdf(page.uri)
      return
    }
    const n = pages.findIndex((other) => other.key === page.key) + 1
    setPreview({ page, label: `${words.pageN(n)}, ${pageCaption(t, page)}` })
  }

  async function save() {
    if (pages.length === 0 || sending.current) return
    const tooLong = title.trim().length > DOCUMENT_LIMITS.titleMax
    setTitleError(tooLong ? t.documents.view.titleTooLong(DOCUMENT_LIMITS.titleMax) : null)
    if (!kind || tooLong) {
      setKindError(!kind)
      // The chips sit at the top, above the pages: brought into view, and the dock says it too.
      if (!kind) scroller.current?.scrollTo({ y: 0, animated: true })
      AccessibilityInfo.announceForAccessibility(!kind ? words.kindRequired : t.documents.view.titleTooLong(DOCUMENT_LIMITS.titleMax))
      return
    }
    sending.current = true
    setMessage(null)
    setProgress({ step: 'start' })
    try {
      const doc = await uploadDocument(uploadDeps, id, { kind, title }, pages, setProgress)
      void invalidate([queryKeys.documents(id)])
      unsaved.leave(() => router.replace(`${documentRoute.view(id, doc.id)}?saved=added`))
    } catch (cause) {
      const said = uploadMessage(t, uploadFailure(cause))
      setMessage(said)
      AccessibilityInfo.announceForAccessibility(said.kind === 'file' ? `${said.title}. ${said.body}` : said.text)
    } finally {
      sending.current = false
      setProgress(null)
    }
  }

  const progressText =
    progress === null
      ? null
      : progress.step === 'page'
        ? words.uploading(progress.n, progress.total)
        : progress.step === 'check'
          ? words.checking
          : words.saving

  const methodButton = (method: PickMethod, more: boolean, index: number) => {
    const title =
      method === 'camera'
        ? more
          ? words.cameraMore
          : words.camera
        : method === 'library'
          ? more
            ? words.libraryMore
            : words.library
          : more && pages.some(isPdfPage)
            ? words.otherPdf
            : words.pdf
    return (
      <Button
        key={method}
        title={title}
        kind={index === 0 && !more ? 'primary' : 'secondary'}
        disabled={picking || busy}
        onPress={() => void add(method)}
      />
    )
  }

  const pdfMb = megabytes(DOCUMENT_LIMITS.pdfMaxBytes)

  return (
    <Screen
      title={words.title}
      onBack={() => router.back()}
      backLabel={t.documents.backToList}
      subtitle={petName}
      scroll
      scrollRef={scroller}
      dock={
        <View style={styles.dock}>
          <Button title={t.documents.upload.save} busy={busy} disabled={pages.length === 0} onPress={() => void save()} />
          {/* What stopped the save is said by the button that was pressed, wherever the form is scrolled. */}
          {progressText ? (
            <Text variant="caption" tone="muted" center accessibilityLiveRegion="polite">
              {progressText}
            </Text>
          ) : kindError ? (
            <Text variant="caption" tone="danger" center>
              {words.kindRequired}
            </Text>
          ) : titleError ? (
            <Text variant="caption" tone="danger" center>
              {titleError}
            </Text>
          ) : message ? (
            <Text variant="caption" tone="danger" center>
              {message.kind === 'file' ? message.title : message.text}
            </Text>
          ) : pages.length === 0 ? (
            <Text variant="caption" tone="faint" center>
              {words.pagesRequired}
            </Text>
          ) : null}
        </View>
      }
    >
      {message?.kind === 'file' ? <Notice title={message.title} body={message.body} tone="error" /> : null}
      {message?.kind === 'banner' ? <Banner text={message.text} tone="error" icon={message.offline ? 'wifi' : 'alert'} /> : null}

      <KindChoice
        disabled={busy}
        value={kind}
        onChange={(next) => {
          setKind(next)
          setKindError(false)
        }}
        error={kindError ? words.kindRequired : null}
      />

      {pages.length === 0 ? (
        <View style={styles.pick}>
          <Icon name="camera" size={32} color={colour.accentText} />
          <Text variant="h2">{words.pagesTitle}</Text>
          <Text tone="muted">{limitsText(t, pdfAvailable)}</Text>
          <View style={styles.buttons}>{pickMethods(pdfAvailable).map((method, index) => methodButton(method, false, index))}</View>
        </View>
      ) : (
        <>
          <Text tone="muted" style={styles.hint}>
            {pages.some(isPdfPage) ? words.pdfPreview : words.pagesHint}
          </Text>
          <PageList pages={pages} onOpen={(page) => void open(page)} onMove={move} onRemove={remove} disabled={busy} />
          <View style={[styles.buttons, styles.more]}>
            {addMoreMethods(pages, pdfAvailable).map((method, index) => methodButton(method, true, index))}
          </View>
        </>
      )}

      {picking ? (
        <Text tone="muted" style={styles.hint} accessibilityLiveRegion="polite">
          {words.preparing}
        </Text>
      ) : null}
      {cameraDenied ? <Banner text={words.cameraDenied} tone="note" /> : null}
      {dropped ? (
        <Banner text={dropped === 'limit' ? words.dropped.limit(DOCUMENT_LIMITS.maxImages) : words.dropped.pdf_alone} tone="note" />
      ) : null}
      {problems.map((problem, index) => (
        <Banner
          key={`${problem.reason}-${index}`}
          tone="error"
          text={
            problem.reason === 'pdf_too_large'
              ? words.fileProblems.pdf_too_large(problem.name, pdfMb)
              : words.fileProblems[problem.reason](problem.name)
          }
        />
      ))}

      <Text variant="caption" tone="faint" style={styles.hint}>
        {words.lightHint}
      </Text>

      <Field
        label={words.titleField}
        value={title}
        onChangeText={setTitle}
        placeholder={kind ? t.documents.kinds[kind] : undefined}
        hint={kind ? words.titleHint(t.documents.kinds[kind]) : words.titleHintNoKind}
        error={titleError}
        maxLength={DOCUMENT_LIMITS.titleMax}
        editable={!busy}
        autoCorrect={false}
      />

      <ConfirmDialog
        visible={unsaved.pending !== null}
        title={words.leaveTitle}
        message={words.leaveBody}
        confirmTitle={words.leaveConfirm}
        cancelTitle={words.leaveStay}
        onConfirm={() => unsaved.pending && unsaved.leave(unsaved.pending)}
        onCancel={unsaved.stay}
      />

      <PagePreview page={preview?.page ?? null} label={preview?.label ?? ''} onClose={() => setPreview(null)} />
    </Screen>
  )
}

/** A chosen photo, across the screen, before it is sent; the way back is a button at the bottom. */
function PagePreview({ page, label, onClose }: { page: DraftPage | null; label: string; onClose: () => void }) {
  const t = useText()
  // The shape of each photo, by its file: a new page starts from A4 until it loads, an old one keeps its own.
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const ratio = page ? ratios[page.uri] : undefined
  return (
    <Modal visible={page !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.preview}>
        <View style={styles.previewBody}>
          {page ? (
            <Image
              source={{ uri: page.uri }}
              resizeMode="contain"
              accessible
              accessibilityLabel={label}
              accessibilityIgnoresInvertColors
              onLoad={(event) => {
                const { width, height } = event.nativeEvent.source
                if (width > 0 && height > 0) setRatios((known) => ({ ...known, [page.uri]: width / height }))
              }}
              style={[styles.previewImage, { aspectRatio: ratio ?? 210 / 297 }]}
            />
          ) : null}
        </View>
        <View style={styles.previewDock}>
          <Button title={t.documents.upload.previewClose} kind="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  dock: { gap: 6 },
  pick: {
    gap: space.row,
    padding: space.block,
    marginBottom: space.block,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colour.line,
    borderRadius: radius.card,
  },
  buttons: { gap: space.row, marginTop: 4 },
  more: { marginTop: space.row, marginBottom: space.block },
  hint: { marginBottom: space.row },
  preview: { flex: 1, backgroundColor: colour.canvas },
  previewBody: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter, width: '100%', maxWidth: COLUMN_MAX_WIDTH, alignSelf: 'center' },
  previewImage: { width: '100%', maxHeight: '100%', borderRadius: radius.field, backgroundColor: colour.soft },
  previewDock: { paddingHorizontal: space.gutter, paddingVertical: space.row, width: '100%', maxWidth: COLUMN_MAX_WIDTH, alignSelf: 'center' },
})
