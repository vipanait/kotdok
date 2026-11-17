'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { PetDocument } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { FormNotice, FormSkeleton } from '@/features/medical-record/form-parts'
import { RecordProblem } from '@/features/medical-record/MedicalRecordScreen'
import { documentFormat, documentHref, documentPageCount, documentTitle, originalPage, type OriginalReturn } from './document-view'
import PageZoom from './PageZoom'
import { useDocument } from './use-documents'

/**
 * `/pets/[id]/documents/[docId]/original` (DOC-1): the document as it was
 * saved, one page at a time — «страница N из M», «Предыдущая» and
 * «Следующая», a page larger on «Увеличить» — and back, at the top and
 * under the page, to the screen it was opened from (`back`). A PDF opens in
 * a new tab by its signed link.
 */
export default function DocumentOriginal({ petId, docId, page, back }: { petId: string; docId: string; page: string | undefined; back: OriginalReturn }) {
  const dict = useTranslations()
  const words = dict.documents
  const { state, reload } = useDocument(petId, docId)

  if (state.status === 'not_found') {
    return <FormNotice id="document-gone" title={words.view.notFoundTitle} body={words.view.notFoundBody} href={documentHref.list(petId)} action={words.view.backToList} />
  }
  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }
  return <OriginalPages key={state.data.id} petId={petId} doc={state.data} initialPage={page} back={back} />
}

function OriginalPages({ petId, doc, initialPage, back }: { petId: string; doc: PetDocument; initialPage: string | undefined; back: OriginalReturn }) {
  const dict = useTranslations()
  const words = dict.documents.original
  const title = documentTitle(dict, doc)
  const pdf = documentFormat(doc) === 'pdf' ? doc.files[0] : undefined
  const total = pdf ? (documentPageCount(doc) ?? 1) : doc.files.length
  const [page, setPage] = useState(() => originalPage(initialPage, doc.files.length))
  const [zoomed, setZoomed] = useState(false)
  const headingRef = useRef<HTMLParagraphElement>(null)
  const turned = useRef(false)

  // The address keeps the page, so a reload or a shared link opens the same one.
  useEffect(() => {
    if (pdf) return
    const href = documentHref.original(petId, doc.id, { page, from: back.href })
    window.history.replaceState(window.history.state, '', href)
    // A turned page is said to a screen reader; the first one is the page itself.
    if (turned.current) headingRef.current?.focus()
  }, [page, pdf, petId, doc.id, back])

  // The top link names the opener as the app's back links do; the bottom button says where it goes.
  const topLabel = back.to === 'document' ? words.toDocument : back.to === 'list' ? dict.documents.view.backToList : words.back
  const backLabel = back.to === 'document' ? words.toDocument : back.to === 'list' ? words.toList : words.back
  const file = pdf ? undefined : doc.files[page - 1]
  const pageText = words.pageOf.replace('{n}', String(page)).replace('{total}', String(total))
  const alt = words.pageAlt.replace('{n}', String(page)).replace('{total}', String(total))

  function turn(next: number) {
    turned.current = true
    setPage(next)
  }

  return (
    <div className="health-page document-original-page">
      <Link href={back.href} className="link health-back">
        <Icon name="back" />
        {topLabel}
      </Link>
      <div className="pagehead">
        <div>
          <h1 className="document-heading">{title}</h1>
          <p ref={headingRef} tabIndex={-1} aria-live="polite">
            {pdf ? `${dict.documents.format.pdf} · ${words.title.toLowerCase()}` : pageText}
          </p>
        </div>
      </div>

      {pdf ? (
        <section className="document-quiet document-original-pdf">
          <p>{words.pdfBody}</p>
          <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="btn primary">
            {words.openPdf}
          </a>
        </section>
      ) : (
        file && (
          <figure className="document-sheet-frame">
            <button type="button" className="document-sheet" onClick={() => setZoomed(true)} aria-label={`${words.zoom}: ${alt}`}>
              {/* A signed link to a private object: next/image would fetch and cache it on the server. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.url} alt={alt} />
            </button>
          </figure>
        )
      )}

      {!pdf && (
        <div className="document-original-actions">
          {total > 1 && (
            <div className="document-turn">
              <button type="button" className="btn secondary" disabled={page <= 1} onClick={() => turn(page - 1)}>
                {words.previous}
              </button>
              <button type="button" className="btn secondary" disabled={page >= total} onClick={() => turn(page + 1)}>
                {words.next}
              </button>
            </div>
          )}
          <button type="button" className="btn secondary document-zoom" onClick={() => setZoomed(true)}>
            {words.zoom}
          </button>
        </div>
      )}

      <div className="document-original-back">
        <Link href={back.href} className="btn secondary">
          {backLabel}
        </Link>
      </div>

      {zoomed && file && <PageZoom src={file.url} alt={alt} closeLabel={words.close} onClose={() => setZoomed(false)} />}
    </div>
  )
}

