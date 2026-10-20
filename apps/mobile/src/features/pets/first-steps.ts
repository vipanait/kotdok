import { VACCINE_TARGETS, type HealthEventInput, type PetSpecies, type VaccineTarget } from '@lapka/contracts'
import { parseDayText } from '@/lib/calendar-day'
import { nextYear } from '@/features/medical-record/due'

/**
 * The step after a new pet's form (FB-2/03, FB-2/04): which core
 * vaccinations it has had and when, and when it last saw a vet. Answers
 * become done vaccination records through the usual endpoint; nothing here
 * is a recommendation — the record keeps what the owner remembers.
 */

/** «Не помню» among the vaccinations; it clears the others. */
export const UNKNOWN = 'unknown' as const
export type VaccineChoice = VaccineTarget | typeof UNKNOWN

export type LastVisit = 'thisYear' | 'overYear' | 'never' | 'unknown'

export type FirstStepsDraft = {
  vaccines: VaccineChoice[]
  /** The day of each chosen vaccination as typed, ДД.ММ.ГГГГ; may be empty. */
  dates: Partial<Record<VaccineTarget, string>>
  lastVisit: LastVisit | null
}

export type FirstStepsRequests =
  | {
      ok: true
      events: HealthEventInput[]
      /** Ticked without a day: no record can say when, but the form's «привит(а)» can. */
      vaccinatedWithoutDate: boolean
      /** Never at a vet, or not for over a year: offer to plan a checkup. */
      offerCheckup: boolean
    }
  | { ok: false; target: VaccineTarget }

export function coreTargets(species: PetSpecies): VaccineTarget[] {
  return VACCINE_TARGETS.filter((target) => target.core && (target.species as readonly string[]).includes(species)).map(
    (target) => target.code,
  )
}

/**
 * The records to create. Vaccinations of one day share a record; each gets
 * its next date a year on, unless that has passed — then none, as the
 * vaccination form does («Срок уже прошёл»). The same answers always give
 * the same requests, so a repeated «Готово» with the screen's keys repeats.
 */
export function firstStepsRequests(draft: FirstStepsDraft, today: string): FirstStepsRequests {
  const chosen = draft.vaccines.filter((choice): choice is VaccineTarget => choice !== UNKNOWN)
  const byDay = new Map<string, VaccineTarget[]>()
  let withoutDate = false

  for (const target of chosen) {
    const typed = draft.dates[target]?.trim() ?? ''
    if (typed === '') {
      withoutDate = true
      continue
    }
    const day = parseDayText(typed)
    if (day === null || day > today) return { ok: false, target }
    byDay.set(day, [...(byDay.get(day) ?? []), target])
  }

  const events: HealthEventInput[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, targets]) => ({
      kind: 'vaccination',
      status: 'done',
      date,
      items: targets.map((target) => {
        const next = nextYear(date)
        return { name: null, targets: [target], next_on: next >= today ? next : null }
      }),
    }))

  return {
    ok: true,
    events,
    vaccinatedWithoutDate: withoutDate,
    offerCheckup: draft.lastVisit === 'never' || draft.lastVisit === 'overYear',
  }
}
