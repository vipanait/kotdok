import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import AddRecordChooser from '@/features/medical-record/AddRecordChooser'
import { addableRecordTypes, parseRecordType } from '@/features/medical-record/stage'
import { NewEventScreen } from '@/features/medical-record/events/EventFormScreen'
import { NewWeightScreen } from '@/features/medical-record/weight/WeightFormScreen'
import { NewCourseScreen } from '@/features/medical-record/medications/CourseFormScreen'
import { NewVisitScreen, type VisitFromCheck } from '@/features/medical-record/visits/VisitFormScreen'
import { recordDay } from '@/features/medical-record/view-model'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { UuidSchema } from '@lapka/contracts'
import { reasonFromCheck } from '@lapka/shared'
import { loadCheckResult } from '@/server/checks/load-check-pages'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { urgencyTitle } from '@/shared/utils/urgency'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.addPage.title)

/** A calendar day in the owner's zone. */
function zoneDay(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/**
 * `&check=` of a visit written from a check result (spec §7.22): the check
 * must be the caller's own, of this pet, and live — anything else is a 404,
 * like someone else's record. Its first line becomes the reason; the form
 * names it «По проверке 1 августа · Наблюдаем».
 */
async function visitSource(userId: string, petId: string, checkId: string, dict: Dictionary): Promise<VisitFromCheck | null> {
  if (!UuidSchema.safeParse(checkId).success) return null
  const loaded = await loadCheckResult(userId, checkId)
  if (!loaded || loaded.check.pet_id !== petId) return null
  const timeZone = await getTimeZone()
  const { check } = loaded
  const words = dict.medicalRecord
  return {
    checkId: check.id,
    reason: reasonFromCheck(check.symptoms_input),
    link: {
      href: `/check/${check.id}`,
      text: words.visitsPage.byCheck.replace('{day}', recordDay(words, zoneDay(check.created_at, timeZone), zoneDay(new Date(), timeZone))),
      urgency: check.urgency,
      urgencyText: urgencyTitle(dict.urgency[check.urgency]?.label),
    },
  }
}

/**
 * A new record: `?type=weight`, `?type=vaccination`, `?type=medication`, `?type=visit` (with `&check=` from a check result)… is that type's form; no type is «Что
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
  const rawCheck = typeof query.check === 'string' ? query.check : null
  const path = `/pets/${id}/health/new${typeof rawType === 'string' ? `?type=${encodeURIComponent(rawType)}` : ''}${
    rawType === 'visit' && rawCheck ? `&check=${encodeURIComponent(rawCheck)}` : ''
  }`
  const { cabinet, pet, dict } = await openPetPage(id, path)

  // The site and its API are one deploy, so the stage alone says what can be saved.
  const open = addableRecordTypes(null)
  const type = parseRecordType(rawType)
  if (rawType !== undefined && (!type || !open.includes(type))) notFound()
  if (!type && open.length === 0) notFound()

  // A visit from a check result: that check, verified here; one that is not this pet's is not there.
  const fromCheck = type === 'visit' && rawCheck !== null ? await visitSource(cabinet.user.id, id, rawCheck, dict) : null
  if (type === 'visit' && rawCheck !== null && !fromCheck) notFound()

  const crumb = `${dict.medicalRecord.title} / ${type ? dict.medicalRecord.addPage.types[type] : dict.medicalRecord.addPage.title}`
  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={crumb}>
      {type === 'weight' ? (
        <NewWeightScreen key={id} petId={id} petName={pet.name} />
      ) : type === 'vaccination' || type === 'parasite' ? (
        // Keyed by pet: another pet's form starts clean, and its catalogue search with it.
        <NewEventScreen key={`${id}-${type}`} petId={id} petName={pet.name} species={pet.species} kind={type} />
      ) : type === 'visit' ? (
        <NewVisitScreen key={`${id}-${fromCheck?.checkId ?? ''}`} petId={id} petName={pet.name} fromCheck={fromCheck} />
      ) : type === 'medication' ? (
        <NewCourseScreen key={id} petId={id} petName={pet.name} />
      ) : type ? (
        notFound()
      ) : (
        <AddRecordChooser petId={id} petName={pet.name} types={open} dict={dict} />
      )}
    </CabinetShell>
  )
}
