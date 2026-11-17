'use client'

import Link from 'next/link'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { documentHref, documentTitle } from '../document-view'
import { useDocument } from '../use-documents'

/**
 * «Из документа: Ветпаспорт · страница 2 · открыть оригинал» under a record
 * confirmed from a document — the name and the page, no preview. The page
 * only when known (the contract has no `source_page` yet).
 */
export function SourceLine({ title, page = null, href }: { title: string; page?: number | null; href: string }) {
  const words = useTranslations().documents.source
  const meta = [page ? words.page.replace('{n}', String(page)) : null, words.open].filter(Boolean).join(' · ')
  return (
    <section className="record-source" aria-labelledby="record-source-title">
      <h2 id="record-source-title">{words.label}</h2>
      <Link href={href} className="document-row document-original no-format">
        <span className="document-row-text">
          <strong>{title}</strong>
          <small>{meta}</small>
        </span>
        <Icon name="chevron" />
      </Link>
    </section>
  )
}

/**
 * The source line of a record, read by `source_document_id` through the
 * document read (`GET /pets/{id}/documents/{docId}`). Nothing at all while
 * it loads, when the document is gone (deleted: the record stays) or the
 * read fails — the record never waits for it.
 */
export function SourceDocumentLine({ petId, docId, from }: { petId: string; docId: string; from: string }) {
  const dict = useTranslations()
  const { state } = useDocument(petId, docId)
  if (state.status !== 'ready') return null
  return <SourceLine title={documentTitle(dict, state.data)} href={documentHref.original(petId, docId, { from })} />
}
