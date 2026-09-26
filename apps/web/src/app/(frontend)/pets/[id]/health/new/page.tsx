import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import AddRecordChooser from '@/features/medical-record/AddRecordChooser'
import { addableRecordTypes, parseRecordType } from '@/features/medical-record/stage'
import { NewWeightScreen } from '@/features/medical-record/weight/WeightFormScreen'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.addPage.title)

/**
 * A new record: `?type=weight` is that type's form; no type is «Что
 * добавить?». A type whose stage is not open, or an unknown one, is a 404 —
 * the site has no form for it yet.
 */
export default async function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const query = await searchParams
  const rawType = query.type
  const path = `/pets/${id}/health/new${typeof rawType === 'string' ? `?type=${encodeURIComponent(rawType)}` : ''}`
  const { cabinet, pet, dict } = await openPetPage(id, path)

  // The site and its API are one deploy, so the stage alone says what can be saved.
  const open = addableRecordTypes(null)
  const type = parseRecordType(rawType)
  if (rawType !== undefined && (!type || !open.includes(type))) notFound()
  if (!type && open.length === 0) notFound()

  const crumb = `${dict.medicalRecord.title} / ${type === 'weight' ? dict.medicalRecord.weightPage.title : dict.medicalRecord.addPage.title}`
  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={crumb}>
      {type === 'weight' ? (
        <NewWeightScreen key={id} petId={id} petName={pet.name} />
      ) : (
        <AddRecordChooser petId={id} petName={pet.name} types={open} dict={dict} />
      )}
    </CabinetShell>
  )
}
