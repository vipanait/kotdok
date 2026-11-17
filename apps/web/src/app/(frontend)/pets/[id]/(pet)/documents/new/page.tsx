import CabinetShell from '@/components/cabinet/CabinetShell'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import DocumentUpload from '@/features/documents/DocumentUpload'
import { documentHref } from '@/features/documents/document-view'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.documents.upload.title)

/** A new document of the pet (DOC-1): its kind, its pages, «Сохранить документ». */
export default async function NewDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cabinet, pet, dict } = await openPetPage(id, documentHref.add(id))

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.documents.title} / ${dict.documents.upload.title}`}>
      <DocumentUpload key={id} petId={id} petName={pet.name} />
    </CabinetShell>
  )
}
