import CabinetShell from '@/components/cabinet/CabinetShell'
import { medicalRecordHref } from '@/features/medical-record/routes'
import SitterMemoScreen from '@/features/medical-record/summary/SitterMemoScreen'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.memo.title)

/**
 * «Памятка для передержки» (FB-3/02): the pet's own gate, as every page of
 * the record — someone else's pet, a deleted one and a malformed id are a
 * 404 here, and the record behind it is read with the owner's session. No
 * public address: the memo leaves only as text the owner copies.
 */
export default async function SitterMemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cabinet, dict } = await openPetPage(id, medicalRecordHref.sitterMemo(id))

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.memo.title}`}>
      <SitterMemoScreen key={id} petId={id} />
    </CabinetShell>
  )
}
