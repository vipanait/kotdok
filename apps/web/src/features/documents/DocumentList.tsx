'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { DOCUMENT_LIMITS } from '@lapka/contracts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { useToday } from '@/features/forms/use-today'
import { RecordProblem, StaleNotice } from '@/features/medical-record/MedicalRecordScreen'
import { RetryButton } from '@/features/medical-record/MedicalRecordView'
import SavedNotice from '@/features/medical-record/SavedNotice'
import { medicalRecordHref } from '@/features/medical-record/routes'
import { formatCount } from '@/shared/i18n/plural'
import { documentHref, documentRow, type DocumentRowView, type DocumentSaved } from './document-view'
import { useDocumentList } from './use-documents'

/**
 * `/pets/[id]/documents` (DOC-1): «← Медкарта», «Документы», the pet's name
 * and how many there are; then the documents, newest first, as compact rows
 * — the name, the kind, the date when it has one, the pages, a status worth
 * a word, PDF or photos — each opening its page. A failed read says so with
 * «Повторить» instead of an empty list; at the limit «Добавить документ»
 * gives way to how to make room.
 */
export default function DocumentList({ petId, petName, saved = null }: { petId: string; petName: string; saved?: DocumentSaved | null }) {
  const dict = useTranslations()
  const words = dict.documents
  const locale = useLocale()
  const today = useToday()
  const { state, reload } = useDocumentList(petId)

  const head = (subtitle: string, action: React.ReactNode = null) => (
    <>
      <Link href={medicalRecordHref.record(petId)} className="link health-back">
        <Icon name="back" />
        {words.backToRecord}
      </Link>
      <div className="pagehead">
        <div>
          <h1>{words.title}</h1>
          <p className="document-subtitle">{subtitle}</p>
        </div>
        {action}
      </div>
    </>
  )

  const skeleton = (
      <div className="health-page documents-page" role="status" aria-live="polite" aria-busy="true">
        {head(petName)}
        <p className="field-hint">{words.loading}</p>
        <div className="documents-skeleton" aria-hidden>
          <div className="skeleton-block" />
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      </div>
  )

  if (state.status === 'loading') return skeleton

  if (state.status === 'failed') {
    return (
      <div className="health-page documents-page">
        {head(petName)}
        <ListFailed title={words.failed.title} body={words.failed.body} retry={<RetryButton onRetry={reload} retrying={state.retrying} dict={dict} className="btn primary" />} />
      </div>
    )
  }

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={skeleton} />
  }

  const { documents } = state.data
  const full = documents.length >= DOCUMENT_LIMITS.perPet
  const empty = documents.length === 0
  const addButton = (
    <Link href={documentHref.add(petId)} className="btn primary">
      <Icon name="plus" />
      {words.add}
    </Link>
  )

  return (
    <div className="health-page documents-page">
      {head(empty ? petName : `${petName} · ${formatCount(words.count, documents.length, locale)}`, full || empty ? null : addButton)}

      {saved && <SavedNotice text={words.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />

      <div className="section-layout document-layout">
        <div className="section-main document-main">
          {full && (
            <div className="banner document-alert" role="note">
              <strong>{words.full.title.replace('{count}', formatCount(words.count, documents.length, locale))}</strong>
              <p>{words.full.body}</p>
            </div>
          )}

          {empty ? (
            <section className="document-quiet" aria-labelledby="documents-empty-title">
              <h2 id="documents-empty-title">{words.empty.title}</h2>
              <p>{words.empty.body}</p>
              {addButton}
            </section>
          ) : (
            <ul className="documents-list" aria-label={words.title}>
              {documents.map((doc) => (
                <li key={doc.id}>
                  <DocumentRow href={documentHref.view(petId, doc.id)} row={documentRow(dict, locale, doc, today)} formatLabel={words.format} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="section-aside document-aside">
          <h2>{empty ? words.empty.asideTitle : words.listAside.title}</h2>
          <p>{empty ? words.empty.asideBody : words.listAside.body}</p>
        </aside>
      </div>
    </div>
  )
}

function DocumentRow({ href, row, formatLabel }: { href: string; row: DocumentRowView; formatLabel: { pdf: string; photo: string } }) {
  return (
    <Link href={href} className="document-row">
      <span className="document-format">{formatLabel[row.format]}</span>
      <span className="document-row-text">
        <strong>{row.title}</strong>
        {row.meta && <small>{row.meta}</small>}
        {row.status && <span className="document-status">{row.status}</span>}
      </span>
      <Icon name="chevron" />
    </Link>
  )
}

function ListFailed({ title, body, retry }: { title: string; body: string; retry: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  // A list that turned into an error says so to a screen reader too.
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <section className="document-quiet" aria-labelledby="documents-failed-title">
      <h2 id="documents-failed-title" ref={ref} tabIndex={-1}>{title}</h2>
      <p>{body}</p>
      {retry}
    </section>
  )
}
