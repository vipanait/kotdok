import { notFound } from 'next/navigation'
import { UuidSchema } from '@lapka/contracts'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import DocumentViewer from '@/features/documents/DocumentViewer'
import { documentHref, parseDocumentSaved } from '@/features/documents/document-view'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.documents.title)

/**
 * One document of the pet (DOC-1). A malformed id is a 404 here; a
 * document that is not there (deleted, someone else's) is said by the
 * screen once the API answers — the page has already streamed under the
 * pet's skeleton by then.
 */
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, docId } = await params
  if (!UuidSchema.safeParse(docId).success) notFound()
  const { cabinet, dict } = await openPetPage(id, documentHref.view(id, docId))
  const saved = parseDocumentSaved((await searchParams).saved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.documents.title}`}>
      <DocumentViewer key={docId} petId={id} docId={docId} saved={saved} />
    </CabinetShell>
  )
}
