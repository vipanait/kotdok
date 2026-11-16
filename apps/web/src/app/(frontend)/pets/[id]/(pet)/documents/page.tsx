import CabinetShell from '@/components/cabinet/CabinetShell'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import DocumentList from '@/features/documents/DocumentList'
import { documentHref, parseDocumentSaved } from '@/features/documents/document-view'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.documents.title)

/** The pet's documents (DOC-1), read through the v1 API in the browser. */
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const { cabinet, pet, dict } = await openPetPage(id, documentHref.list(id))
  const saved = parseDocumentSaved((await searchParams).saved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.documents.title}`}>
      <DocumentList key={id} petId={id} petName={pet.name} saved={saved} />
    </CabinetShell>
  )
}
