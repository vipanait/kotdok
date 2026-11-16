'use client'

import Link from 'next/link'
import { DOCUMENT_LIMITS, type PetDocument } from '@lapka/contracts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { useToday } from '@/features/forms/use-today'
import { RecordProblem, StaleNotice } from '@/features/medical-record/MedicalRecordScreen'
import SavedNotice from '@/features/medical-record/SavedNotice'
import { medicalRecordHref } from '@/features/medical-record/routes'
import { documentHref, documentMeta, documentTitle, type DocumentSaved } from './document-view'
import { useDocumentList } from './use-documents'

/**
 * `/pets/[id]/documents` (DOC-1): the pet's documents, newest first — the
 * kind, the name, the date, how many pages, and «Ждёт проверки» once
 * recognition comes (DOC-2). Each opens its page. «Добавить документ» is
 * there until the pet holds the most it can.
 */
export default function DocumentList({ petId, petName, saved = null }: { petId: string; petName: string; saved?: DocumentSaved | null }) {
  const dict = useTranslations()
  const words = dict.documents
  const locale = useLocale()
  const today = useToday()
  const { state, reload } = useDocumentList(petId)

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<ListSkeleton label={words.loading} title={words.title} />} />
  }

  const { documents } = state.data
  const full = documents.length >= DOCUMENT_LIMITS.perPet

  return (
    <div className="health-page documents-page">
      <Link href={medicalRecordHref.record(petId)} className="link health-back">
        <Icon name="back" />
        {words.backToRecord}
      </Link>
      <div className="pagehead">
        <div>
          <h1>{words.title}</h1>
          <p>{petName}</p>
        </div>
        {!full && (
          <Link href={documentHref.add(petId)} className="btn primary">
            {words.add}
          </Link>
        )}
      </div>

      {saved && <SavedNotice text={words.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />
      {full && <p className="banner documents-full">{words.limitNote.replace('{n}', String(DOCUMENT_LIMITS.perPet))}</p>}

      {documents.length === 0 ? (
        <section className="card events-empty documents-empty" aria-labelledby="documents-empty-title">
          <h2 id="documents-empty-title">{words.empty.title}</h2>
          <p>{words.empty.body}</p>
          <Link href={documentHref.add(petId)} className="btn primary">
            {words.add}
          </Link>
        </section>
      ) : (
        <ul className="documents-list" aria-label={words.title}>
          {documents.map((doc) => (
            <li key={doc.id}>
              <DocumentRow petId={petId} doc={doc} title={documentTitle(dict, doc)} meta={documentMeta(dict, locale, doc, today)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DocumentRow({ petId, doc, title, meta }: { petId: string; doc: PetDocument; title: string; meta: string }) {
  const first = doc.files[0]
  const thumb = first && first.content_type !== 'application/pdf' && first.url ? first.url : null
  return (
    <Link href={documentHref.view(petId, doc.id)} className="card document-row">
      <span className="document-thumb" aria-hidden>
        {thumb ? (
          // A signed link to a private object: next/image would fetch and cache it on the server.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" />
        ) : (
          <span className="document-thumb-pdf">PDF</span>
        )}
      </span>
      <span className="document-row-text">
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <Icon name="chevron" />
    </Link>
  )
}

function ListSkeleton({ label, title }: { label: string; title: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="pagehead" aria-hidden>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="skeleton-block documents-skeleton" aria-hidden />
    </div>
  )
}
