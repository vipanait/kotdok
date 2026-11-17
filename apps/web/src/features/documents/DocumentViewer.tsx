'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PetDocument } from '@lapka/contracts'
import { apiFailure } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { useToday } from '@/features/forms/use-today'
import { FormNotice, FormSkeleton } from '@/features/medical-record/form-parts'
import { RecordProblem } from '@/features/medical-record/MedicalRecordScreen'
import SavedNotice from '@/features/medical-record/SavedNotice'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { browserApi } from '@/features/api/browser-api'
import DocumentDetailsForm from './DocumentDetailsForm'
import { documentFormat, documentHeadline, documentHref, documentPages, documentTitle, isArchiveKind, type DocumentSaved } from './document-view'
import { useDocument } from './use-documents'

/**
 * `/pets/[id]/documents/[docId]` (DOC-1): one stored document — «Открыть
 * оригинал» (the pages one by one, or the PDF in a new tab), a word that an
 * archive kind is kept as a file, its name, kind and date behind «Название и
 * дата», and «Удалить документ» behind a question. A document gone meanwhile
 * is said so, with the way back to the list.
 *
 * `recognitionOffer`: where DOC-2 puts «Распознать» for a passport or a
 * prescription, and only once the API says recognition is available (ruling
 * R2 of the design run). Nothing passes it yet, so real users never see an
 * offer that would fail.
 */
export default function DocumentViewer({
  petId,
  docId,
  saved = null,
  recognitionOffer = null,
}: {
  petId: string
  docId: string
  saved?: DocumentSaved | null
  recognitionOffer?: ((doc: PetDocument) => React.ReactNode) | null
}) {
  const dict = useTranslations()
  const words = dict.documents
  const { state, reload } = useDocument(petId, docId)

  if (state.status === 'not_found') {
    return <FormNotice id="document-gone" title={words.view.notFoundTitle} body={words.view.notFoundBody} href={documentHref.list(petId)} action={words.view.backToList} />
  }
  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }
  return <DocumentPage key={state.data.id} petId={petId} loaded={state.data} saved={saved} recognitionOffer={recognitionOffer} />
}

function DocumentPage({
  petId,
  loaded,
  saved,
  recognitionOffer,
}: {
  petId: string
  loaded: PetDocument
  saved: DocumentSaved | null
  recognitionOffer: ((doc: PetDocument) => React.ReactNode) | null
}) {
  const dict = useTranslations()
  const words = dict.documents
  const view = words.view
  const locale = useLocale()
  const today = useToday()
  const router = useRouter()
  const [doc, setDoc] = useState(loaded)
  const [notice, setNotice] = useState<{ key: number; saved: DocumentSaved } | null>(saved ? { key: 0, saved } : null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | undefined>()
  const deleteRef = useRef<HTMLButtonElement>(null)

  const title = documentTitle(dict, doc)
  const format = documentFormat(doc)
  const pdf = format === 'pdf' ? doc.files[0] : undefined
  const pagesText = documentPages(dict, locale, doc)
  const originalMeta =
    format === 'pdf'
      ? [words.format.pdf, pagesText, view.pdfNewTab].filter(Boolean).join(' · ')
      : [pagesText, view.photos].filter(Boolean).join(' · ')

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError(undefined)
    try {
      await browserApi().deleteDocument(petId, doc.id)
      router.push(`${documentHref.list(petId)}?saved=deleted`)
    } catch (error) {
      const failure = apiFailure(error)
      // Gone already — deleted on another device, or an earlier try whose answer was lost.
      if (failure === 'gone') {
        router.push(`${documentHref.list(petId)}?saved=deleted`)
        return
      }
      setDeleting(false)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      if (failure !== 'offline') console.warn('[documents] delete failed', error)
      setDeleteError(failure === 'offline' ? words.upload.errors.offline : failure === 'signedOut' ? words.upload.errors.signedOut : view.deleteFailed)
    }
  }

  const originalContent = (
    <>
      <span className="document-format" aria-hidden>{words.format[format]}</span>
      <span className="document-row-text">
        <strong>{view.openOriginal}</strong>
        <small>{originalMeta}</small>
      </span>
      <Icon name="chevron" />
    </>
  )

  return (
    <div className="health-page document-page-view">
      <Link href={documentHref.list(petId)} className="link health-back">
        <Icon name="back" />
        {view.backToList}
      </Link>
      <div className="pagehead">
        <div>
          <h1 className="document-heading">{title}</h1>
          <p>{documentHeadline(dict, locale, doc)}</p>
        </div>
      </div>

      {notice && <SavedNotice key={notice.key} text={words.saved[notice.saved]} />}

      <div className="section-layout document-layout">
        <div className="section-main document-main">
          {pdf ? (
            <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="document-row document-original">
              {originalContent}
            </a>
          ) : (
            <Link href={documentHref.original(petId, doc.id)} className="document-row document-original">
              {originalContent}
            </Link>
          )}

          {isArchiveKind(doc.kind) && (
            <section className="document-quiet" aria-labelledby="document-archive-title">
              <h2 id="document-archive-title">{view.archiveTitle}</h2>
              <p>{view.archiveBody[doc.kind]}</p>
            </section>
          )}

          {recognitionOffer?.(doc)}

          <details className="document-more">
            <summary>{view.details}</summary>
            <DocumentDetailsForm
              key={`${doc.title}|${doc.kind}|${doc.document_date}`}
              petId={petId}
              doc={doc}
              today={today}
              disabled={deleting}
              onSaved={(next) => {
                setDoc(next)
                setNotice((current) => ({ key: (current?.key ?? 0) + 1, saved: 'changed' }))
              }}
            />
          </details>

          <button
            ref={deleteRef}
            type="button"
            className="link danger document-delete"
            onClick={() => {
              setDeleteError(undefined)
              setConfirmDelete(true)
            }}
          >
            {view.delete}
          </button>
        </div>

        <aside className="section-aside document-aside">
          <h2>{view.asideTitle}</h2>
          <p>{view.asideBody}</p>
        </aside>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={view.deleteTitle}
          body={view.deleteBody.replace('{title}', title)}
          cancelLabel={view.keep}
          confirmLabel={view.deleteConfirm}
          busyLabel={view.deleting}
          busy={deleting}
          error={deleteError}
          tone="danger"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          returnFocusRef={deleteRef}
        />
      )}
    </div>
  )
}
