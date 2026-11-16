'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DOCUMENT_KINDS, type DocumentKind } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { browserApi } from '@/features/api/browser-api'
import { documentHref } from './document-view'
import PageList, { type ChosenPage } from './PageList'
import { addPages, movePage, pictureRoom, preparePages, type PagesDropped } from './prepare-pages'
import { putFile, uploadDocument, uploadFailure, type UploadProgress } from './upload-document'

let nextPageId = 0

/**
 * `/pets/[id]/documents/new` (DOC-1): what the document is, then its pages —
 * photos (made small here) or one PDF — in the order they are to be kept,
 * then «Сохранить документ». The pages go straight to storage; the server
 * checks them and answers with the document, whose page the form opens.
 * A refused file is said in words (too many pages, a password, not a photo
 * or a PDF, too large) and the chosen pages stay for another try.
 */
export default function DocumentUpload({ petId, petName }: { petId: string; petName: string }) {
  const dict = useTranslations()
  const words = dict.documents
  const form = words.upload
  const router = useRouter()
  const id = useId()
  const listHref = documentHref.list(petId)

  const [kind, setKind] = useState<DocumentKind | null>(null)
  const [pages, setPages] = useState<ChosenPage[]>([])
  const [preparing, setPreparing] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [errors, setErrors] = useState<{ kind?: string; pages?: string }>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const saving = progress !== null
  const inFlight = useRef(false)
  const kindRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // The chosen pages are what would be lost; a kind alone is one press away.
  const dirty = pages.length > 0
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving, listHref)

  // The previews are the browser's memory: given back when a page goes or the form closes.
  const pagesRef = useRef(pages)
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])
  useEffect(() => () => pagesRef.current.forEach(release), [])

  async function pick(files: File[]) {
    if (files.length === 0) return
    setPreparing(true)
    setNotices([])
    setBanner(null)
    try {
      const prepared = await preparePages(files, pictureRoom(pages))
      const incoming = prepared.pages.map(chosen)
      const result = addPages(pages, incoming)
      const kept = new Set(result.pages.map((page) => page.id))
      for (const page of [...pages, ...incoming]) if (!kept.has(page.id)) release(page)
      setPages(result.pages)
      if (result.pages.length) setErrors((current) => ({ ...current, pages: undefined }))
      // A PDF picked replaces the pictures, so pictures past the room did not matter.
      const pdfPicked = prepared.pages.some((page) => page.contentType === 'application/pdf')
      const dropped: PagesDropped = result.dropped ?? (prepared.overflow && !pdfPicked ? 'limit' : null)
      // Every file that could not be a page is named; the others are kept.
      setNotices([
        ...prepared.problems.map((problem) => form.fileProblems[problem.reason].replace('{name}', problem.fileName)),
        ...(dropped ? [form.dropped[dropped]] : []),
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
    setPages(pages.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current || preparing) return
    const problems = { kind: kind ? undefined : form.kindRequired, pages: pages.length ? undefined : form.pagesRequired }
    if (problems.kind || problems.pages) {
      setErrors(problems)
      ;(problems.kind ? kindRef : fileRef).current?.focus()
      return
    }
    inFlight.current = true
    setBanner(null)
    setNotices([])
    try {
      const doc = await uploadDocument({ ...browserApi(), put: putFile }, petId, kind!, pages, setProgress)
      leave(`${documentHref.view(petId, doc.id)}?saved=added`)
    } catch (error) {
      inFlight.current = false
      setProgress(null)
      const failure = uploadFailure(error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      if (failure === 'failed' || failure === 'upload') console.warn('[documents] save failed', error)
      setBanner(form.errors[failure])
    }
  }

  const progressText =
    progress?.step === 'page'
      ? form.uploading.replace('{n}', String(progress.n)).replace('{total}', String(progress.total))
      : progress?.step === 'check'
        ? form.checking
        : form.saving

  return (
    <div className="health-page document-upload-page">
      <div className="pagehead">
        <div>
          <h1>{form.title}</h1>
          <p>{petName}</p>
        </div>
        <Link href={listHref} className="link">
          <Icon name="back" />
          {words.view.backToList}
        </Link>
      </div>

      <form className="card record-form document-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        <div className="field">
          <span className="field-label" id={`${id}-kind`}>{form.kindLabel}</span>
          <div className="chips" role="group" aria-labelledby={`${id}-kind`} aria-describedby={errors.kind ? `${id}-kind-error` : undefined}>
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
                  setErrors((current) => ({ ...current, kind: undefined }))
                }}
              >
                {words.kinds[value]}
              </button>
            ))}
          </div>
          {errors.kind && <span id={`${id}-kind-error`} className="field-error" role="alert">{errors.kind}</span>}
        </div>

        <div className="field">
          <span className="field-label">{form.pagesLabel}</span>
          {pages.length > 0 && <PageList pages={pages} disabled={saving} onMove={(index, delta) => setPages(movePage(pages, index, delta))} onRemove={remove} />}
          <label className={`btn secondary document-pick${saving || preparing ? ' is-disabled' : ''}`}>
            <Icon name="plus" />
            {preparing ? form.preparing : pages.length ? form.chooseMore : form.choose}
            <input
              ref={fileRef}
              className="sr-only"
              type="file"
              accept="image/*,application/pdf"
              multiple
              disabled={saving || preparing}
              aria-describedby={[`${id}-pages-hint`, errors.pages ? `${id}-pages-error` : null].filter(Boolean).join(' ')}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                void pick(files)
              }}
            />
          </label>
          <span id={`${id}-pages-hint`} className="field-hint">{form.pagesHint}</span>
          {errors.pages && <span id={`${id}-pages-error`} className="field-error" role="alert">{errors.pages}</span>}
          {notices.length > 0 && (
            <ul className="banner document-notice" role="status">
              {notices.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </div>

        {banner && <p className="banner error record-form-error" role="alert">{banner}</p>}

        <div className="form-actions">
          <Link href={listHref} className="link">{form.cancel}</Link>
          <button type="submit" className="btn primary" aria-disabled={saving || preparing || undefined}>
            {saving ? progressText : form.save}
          </button>
        </div>
      </form>

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
  return { ...page, id: `page-${nextPageId}`, preview: page.contentType === 'application/pdf' ? null : URL.createObjectURL(page.blob) }
}

function release(page: ChosenPage): void {
  if (page.preview) URL.revokeObjectURL(page.preview)
}
