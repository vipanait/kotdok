'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DOCUMENT_KINDS, DOCUMENT_LIMITS, type DocumentKind } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { browserApi } from '@/features/api/browser-api'
import { documentHref, withLimits } from './document-view'
import PageList, { type ChosenPage } from './PageList'
import PageZoom from './PageZoom'
import { addPages, isPdfPage, movePage, pickMethods, pictureRoom, preparePages, removePage, type PagesDropped } from './prepare-pages'
import { FILE_REFUSALS, putFile, uploadDocument, uploadFailure, type UploadFailure, type UploadProgress } from './upload-document'

let nextPageId = 0

type Refusal = (typeof FILE_REFUSALS)[number] | 'refused'

function isRefusal(failure: UploadFailure): failure is Refusal {
  return failure === 'refused' || (FILE_REFUSALS as readonly string[]).includes(failure)
}

/**
 * `/pets/[id]/documents/new` (DOC-1): what the document is, then its pages —
 * photos (made small here) or one PDF, each picked with its own button —
 * listed top to bottom in the order they will be kept, an optional name,
 * then «Сохранить документ». The pages go straight to storage; the server
 * checks them and answers with the document, whose page the form opens.
 * A file the server refuses is said with its reason above the form (the
 * design's «Ошибка файла»), and the chosen pages stay for another try.
 */
export default function DocumentUpload({ petId, petName }: { petId: string; petName: string }) {
  const dict = useTranslations()
  const words = dict.documents
  const form = words.upload
  const router = useRouter()
  const id = useId()
  const listHref = documentHref.list(petId)

  const [kind, setKind] = useState<DocumentKind | null>(null)
  const [title, setTitle] = useState('')
  const [pages, setPages] = useState<ChosenPage[]>([])
  const [preparing, setPreparing] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [kindError, setKindError] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [zoomed, setZoomed] = useState<number | null>(null)
  const saving = progress !== null
  const busy = saving || preparing
  const inFlight = useRef(false)
  const kindRef = useRef<HTMLButtonElement>(null)
  const photosRef = useRef<HTMLInputElement>(null)
  const refusalRef = useRef<HTMLDivElement>(null)

  // The chosen pages and a typed name are what would be lost; a kind alone is one press away.
  const dirty = pages.length > 0 || title.trim() !== ''
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving, listHref)

  // The object URLs are the browser's memory: given back when a page goes or the form closes.
  const pagesRef = useRef(pages)
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])
  useEffect(() => () => pagesRef.current.forEach(release), [])

  useEffect(() => {
    if (refusal) refusalRef.current?.focus()
  }, [refusal])

  const focusPicker = useCallback(() => photosRef.current?.focus(), [])

  async function pick(files: File[]) {
    if (files.length === 0) return
    setPreparing(true)
    setNotices([])
    setBanner(null)
    setRefusal(null)
    try {
      const prepared = await preparePages(files, pictureRoom(pages))
      const incoming = prepared.pages.map(chosen)
      const result = addPages(pages, incoming)
      const kept = new Set(result.pages.map((page) => page.id))
      for (const page of [...pages, ...incoming]) if (!kept.has(page.id)) release(page)
      setPages(result.pages)
      // A PDF picked replaces the pictures, so pictures past the room did not matter.
      const pdfPicked = prepared.pages.some(isPdfPage)
      const dropped: PagesDropped = result.dropped ?? (prepared.overflow && !pdfPicked ? 'limit' : null)
      // Every file that could not be a page is named; the others are kept.
      setNotices([
        ...prepared.problems.map((problem) => withLimits(form.fileProblems[problem.reason]).replace('{name}', problem.fileName)),
        ...(dropped ? [withLimits(form.dropped[dropped])] : []),
      ])
    } catch (error) {
      console.warn('[documents] pages not prepared', error)
      setBanner(form.errors.failed)
    } finally {
      setPreparing(false)
    }
  }

  function remove(index: number) {
    release(pages[index])
    setPages(removePage(pages, index))
    setRefusal(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current || preparing || pages.length === 0) return
    if (!kind) {
      setKindError(true)
      kindRef.current?.focus()
      return
    }
    inFlight.current = true
    setBanner(null)
    setRefusal(null)
    setNotices([])
    try {
      const doc = await uploadDocument({ ...browserApi(), put: putFile }, petId, { kind, title }, pages, setProgress)
      leave(`${documentHref.view(petId, doc.id)}?saved=added`)
    } catch (error) {
      inFlight.current = false
      setProgress(null)
      const failure = uploadFailure(error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      if (isRefusal(failure)) {
        setRefusal(failure)
        return
      }
      if (failure === 'failed' || failure === 'upload') console.warn('[documents] save failed', error)
      setBanner(withLimits(form.errors[failure]))
    }
  }

  const progressText =
    progress?.step === 'page'
      ? form.uploading.replace('{n}', String(progress.n)).replace('{total}', String(progress.total))
      : progress?.step === 'check'
        ? form.checking
        : form.saving

  const methods = pickMethods(pages)
  const fileInput = (accept: string, multiple: boolean, ref?: React.Ref<HTMLInputElement>) => (
    <input
      ref={ref}
      className="sr-only"
      type="file"
      accept={accept}
      multiple={multiple}
      disabled={busy}
      aria-describedby={`${id}-limits`}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        void pick(files)
      }}
    />
  )
  const pickers = (methods.photos || methods.pdf) && (
    <div className="document-pickers">
      {methods.photos && (
        <label className={`btn ${pages.length ? 'secondary' : 'primary'} document-pick${busy ? ' is-disabled' : ''}`}>
          <Icon name="plus" />
          {preparing ? form.preparing : pages.length ? form.addPhotos : form.choosePhotos}
          {fileInput('image/*', true, photosRef)}
        </label>
      )}
      {methods.pdf && (
        <label className={`btn secondary document-pick${busy ? ' is-disabled' : ''}`}>
          {form.choosePdf}
          {fileInput('application/pdf,.pdf', false)}
        </label>
      )}
    </div>
  )

  const zoomPage = zoomed !== null ? pages[zoomed] : undefined
  const refusalText = refusal ? form.refusals[refusal] : null

  return (
    <div className="health-page document-upload-page">
      <Link href={listHref} className="link health-back">
        <Icon name="back" />
        {words.view.backToList}
      </Link>
      <div className="pagehead">
        <div>
          <h1>{form.title}</h1>
          <p>{petName}</p>
        </div>
      </div>

      <div className="section-layout document-layout">
        <form className="section-main document-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
          {refusalText && (
            <div ref={refusalRef} tabIndex={-1} className="banner error document-alert" role="alert">
              <strong>{withLimits(refusalText.title)}</strong>
              <p>{withLimits(refusalText.body)}</p>
            </div>
          )}

          <div className="field document-kind">
            <span className="field-label" id={`${id}-kind`}>{form.kindLabel}</span>
            <div
              className="chips"
              role="group"
              aria-labelledby={`${id}-kind`}
              aria-describedby={[kindError ? `${id}-kind-error` : null, kind ? `${id}-kind-hint` : null].filter(Boolean).join(' ') || undefined}
            >
              {DOCUMENT_KINDS.map((value, index) => (
                <button
                  key={value}
                  ref={index === 0 ? kindRef : undefined}
                  type="button"
                  className="chip"
                  aria-pressed={kind === value}
                  disabled={saving}
                  onClick={() => {
                    setKind(value)
                    setKindError(false)
                  }}
                >
                  {words.kinds[value]}
                </button>
              ))}
            </div>
            {kindError && <span id={`${id}-kind-error`} className="field-error" role="alert">{form.kindRequired}</span>}
            {kind && <p id={`${id}-kind-hint`} className="field-hint document-kind-hint">{words.kindHints[kind]}</p>}
          </div>

          {pages.length === 0 ? (
            <section className="document-drop" aria-labelledby={`${id}-pages-title`}>
              <Icon name="plus" />
              <h2 id={`${id}-pages-title`}>{form.pagesTitle}</h2>
              <p id={`${id}-limits`}>{withLimits(form.limits)}</p>
              {pickers}
            </section>
          ) : (
            <section className="document-chosen" aria-labelledby={`${id}-pages-title`}>
              <h2 id={`${id}-pages-title`}>{form.pagesLabel}</h2>
              <p className="field-hint">{form.pagesHint}</p>
              <PageList
                pages={pages}
                disabled={busy}
                onOpen={setZoomed}
                onMove={(index, delta) => setPages(movePage(pages, index, delta))}
                onRemove={remove}
                onEmptied={focusPicker}
              />
              {pickers}
              <p id={`${id}-limits`} className="field-hint">
                {methods.block ? withLimits(form.pickBlocked[methods.block]) : withLimits(form.limits)}
              </p>
            </section>
          )}

          {notices.length > 0 && (
            <ul className="banner error document-notice" role="status">
              {notices.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}

          <div className="field document-title-field">
            <label className="field-label" htmlFor={`${id}-title`}>{form.titleField}</label>
            <input
              id={`${id}-title`}
              className="input"
              type="text"
              maxLength={DOCUMENT_LIMITS.titleMax}
              placeholder={kind ? words.kinds[kind] : undefined}
              value={title}
              readOnly={saving}
              aria-describedby={`${id}-title-hint`}
              onChange={(e) => setTitle(e.target.value)}
            />
            <span id={`${id}-title-hint`} className="field-hint">
              {kind ? form.titleHint.replace('{kind}', words.kinds[kind]) : form.titleHintNoKind}
            </span>
          </div>

          {banner && <p className="banner error record-form-error" role="alert">{banner}</p>}

          <div className="document-actions">
            <button
              type="submit"
              className="btn primary"
              disabled={pages.length === 0 && !saving}
              aria-disabled={busy || undefined}
              aria-describedby={pages.length === 0 ? `${id}-save-hint` : undefined}
            >
              {saving ? progressText : form.save}
            </button>
            {pages.length === 0 && <span id={`${id}-save-hint`} className="field-hint">{form.pagesRequired}</span>}
          </div>
        </form>

        <aside className="section-aside document-aside">
          <h2>{form.asideTitle}</h2>
          <p>{form.asideBody}</p>
          <p>{form.lightHint}</p>
        </aside>
      </div>

      {zoomPage && (
        <PageZoom src={zoomPage.preview} alt={form.pageN.replace('{n}', String((zoomed ?? 0) + 1))} closeLabel={words.original.close} onClose={() => setZoomed(null)} />
      )}

      {leaveHref && (
        <ConfirmDialog
          title={form.leaveTitle}
          body={form.leaveBody}
          cancelLabel={form.leaveStay}
          confirmLabel={form.leaveConfirm}
          onCancel={stay}
          onConfirm={() => leave(leaveHref)}
          returnFocusRef={leaveLinkRef}
        />
      )}
    </div>
  )
}

function chosen(page: { blob: Blob; contentType: ChosenPage['contentType']; name: string }): ChosenPage {
  nextPageId += 1
  return { ...page, id: `page-${nextPageId}`, preview: URL.createObjectURL(page.blob) }
}

function release(page: ChosenPage): void {
  URL.revokeObjectURL(page.preview)
}
