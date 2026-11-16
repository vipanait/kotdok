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
import { documentApi } from './document-api'
import DocumentDetailsForm from './DocumentDetailsForm'
import { documentHref, documentMeta, documentTitle, type DocumentSaved } from './document-view'
import PageZoom from './PageZoom'
import { useDocument } from './use-documents'

/**
 * `/pets/[id]/documents/[docId]` (DOC-1): one document — its pages to look
 * at (a press opens a page large), a PDF in a new tab by its signed link,
 * its name, kind and date to change, and «Удалить документ» behind a
 * question. A document gone meanwhile is said so, with the way back to the list.
 */
export default function DocumentViewer({ petId, docId, saved = null }: { petId: string; docId: string; saved?: DocumentSaved | null }) {
  const dict = useTranslations()
  const words = dict.documents
  const { state, reload } = useDocument(petId, docId)

  if (state.status === 'not_found') {
    return <FormNotice id="document-gone" title={words.view.notFoundTitle} body={words.view.notFoundBody} href={documentHref.list(petId)} action={words.view.backToList} />
  }
  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }
  return <DocumentPage key={state.data.id} petId={petId} loaded={state.data} saved={saved} />
}

function DocumentPage({ petId, loaded, saved }: { petId: string; loaded: PetDocument; saved: DocumentSaved | null }) {
  const dict = useTranslations()
  const words = dict.documents
  const view = words.view
  const locale = useLocale()
  const today = useToday()
  const router = useRouter()
  const [doc, setDoc] = useState(loaded)
  const [notice, setNotice] = useState<{ key: number; saved: DocumentSaved } | null>(saved ? { key: 0, saved } : null)
  const [zoomed, setZoomed] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | undefined>()
  const deleteRef = useRef<HTMLButtonElement>(null)

  const title = documentTitle(dict, doc)
  const pdf = doc.files.find((file) => file.content_type === 'application/pdf')
  const pageAlt = (index: number) => view.pageAlt.replace('{n}', String(index + 1))

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError(undefined)
    try {
      await documentApi().remove(petId, doc.id)
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

  return (
    <div className="health-page document-page-view">
      <Link href={documentHref.list(petId)} className="link health-back">
        <Icon name="back" />
        {view.backToList}
      </Link>
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          <p>{documentMeta(dict, locale, doc, today)}</p>
        </div>
      </div>

      {notice && <SavedNotice key={notice.key} text={words.saved[notice.saved]} />}

      <div className="section-layout">
        <div className="section-main">
          {pdf ? (
            <section className="card document-pdf">
              <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="btn primary">
                {view.openPdf}
              </a>
              <p className="field-hint">{view.pdfNote}</p>
            </section>
          ) : (
            <ol className="document-sheets">
              {doc.files.map((file, index) => (
                <li key={file.id}>
                  <button type="button" className="document-sheet" aria-label={view.zoom.replace('{n}', String(index + 1))} onClick={() => setZoomed(index)}>
                    {/* A signed link to a private object: next/image would fetch and cache it on the server. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.url} alt={pageAlt(index)} loading={index < 2 ? 'eager' : 'lazy'} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="section-aside">
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
          <button
            ref={deleteRef}
            type="button"
            className="link danger record-form-delete"
            onClick={() => {
              setDeleteError(undefined)
              setConfirmDelete(true)
            }}
          >
            {view.delete}
          </button>
        </aside>
      </div>

      {zoomed !== null && doc.files[zoomed] && (
        <PageZoom src={doc.files[zoomed].url} alt={pageAlt(zoomed)} closeLabel={view.close} onClose={() => setZoomed(null)} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={view.deleteTitle.replace('{title}', title)}
          body={view.deleteBody}
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
