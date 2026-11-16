'use client'

import Link from 'next/link'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { documentHref } from './document-view'

/**
 * «Документы» in the pet's medical record (DOC-1): the way to the pet's
 * documents and to adding one. The record's overview does not carry the
 * documents, so the card does not count them; the list is one press away.
 */
export default function DocumentsCard({ petId }: { petId: string }) {
  const dict = useTranslations()
  const words = dict.documents
  return (
    <section className="card health-section wide documents-card" aria-labelledby="health-documents-title">
      <div className="health-card-head">
        <h2 id="health-documents-title">{words.title}</h2>
        <Link href={documentHref.list(petId)} className="link" aria-label={dict.medicalRecord.allIn.replace('{section}', words.title)}>
          {dict.medicalRecord.all}
          <Icon name="arrow" />
        </Link>
      </div>
      <p className="documents-card-body">{words.card.body}</p>
      <Link href={documentHref.add(petId)} className="link">
        <Icon name="plus" />
        {words.add}
      </Link>
    </section>
  )
}
