import { notFound } from 'next/navigation'
import { UuidSchema } from '@lapka/contracts'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import DocumentOriginal from '@/features/documents/DocumentOriginal'
import { documentHref, originalReturn } from '@/features/documents/document-view'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.documents.original.title)

/**
 * The original of a document (DOC-1), page by page. `?page=` is the page
 * shown; `?from=` the screen it was opened from — a page of this pet only,
 * the document's own page otherwise — which both back buttons return to.
 */
export default async function DocumentOriginalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, docId } = await params
  if (!UuidSchema.safeParse(docId).success) notFound()
  const query = await searchParams
  const { cabinet, dict } = await openPetPage(id, documentHref.original(id, docId))
  const back = originalReturn(id, docId, query.from)
  const page = typeof query.page === 'string' ? query.page : undefined

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.documents.title} / ${dict.documents.original.title}`}>
      <DocumentOriginal key={docId} petId={id} docId={docId} page={page} back={back} />
    </CabinetShell>
  )
}
