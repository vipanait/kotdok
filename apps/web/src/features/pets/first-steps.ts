import { CalendarDateSchema, VACCINE_TARGETS, type HealthEventInput, type PetSpecies, type VaccineTarget } from '@lapka/contracts'
import { addMonths } from '@lapka/shared'

/**
 * «Прививки и врач» (design `first-steps`): the optional step after a pet
 * is added the ordinary way — which vaccinations it has had and when, and
 * when it last saw a vet. The phone's rule (FB-2/03, FB-2/04), in the web
 * design's two choices: a complex vaccination and rabies. Answers become
 * done records through the usual endpoint; nothing here recommends anything,
 * and nothing is made up — a vaccination without a day is no record.
 */

export type FirstVaccine = 'complex' | 'rabies'
/** «Не помню» among the vaccinations; it clears the others. */
export type FirstVaccineChoice = FirstVaccine | 'unknown'
export type LastVisit = 'thisYear' | 'overYear' | 'never' | 'unknown'

export const FIRST_VACCINES: readonly FirstVaccineChoice[] = ['complex', 'rabies', 'unknown']
export const LAST_VISITS: readonly LastVisit[] = ['thisYear', 'overYear', 'never', 'unknown']

export type FirstStepsDraft = {
  vaccines: FirstVaccineChoice[]
  /** The day of each chosen vaccination as the date field gives it, `YYYY-MM-DD`; may be empty. */
  dates: Partial<Record<FirstVaccine, string>>
  lastVisit: LastVisit | null
}

export type FirstStepsRequests =
  | {
      ok: true
      events: HealthEventInput[]
      /** Ticked without a day: no record can say when, but the form's «привит(а)» can. */
      vaccinatedWithoutDate: boolean
      /** Never at a vet, or not for over a year: offer to plan a checkup — an offer, not advice. */
      offerCheckup: boolean
    }
  | { ok: false; choice: FirstVaccine }

/** What a choice protects against for this species: «Комплексная» is the core set but rabies. */
export function vaccineTargets(species: PetSpecies, choice: FirstVaccine): VaccineTarget[] {
  if (choice === 'rabies') return ['rabies']
  return VACCINE_TARGETS.filter(
    (target) => target.core && target.code !== 'rabies' && (target.species as readonly string[]).includes(species),
  ).map((target) => target.code)
}

export function toggleVaccine(vaccines: readonly FirstVaccineChoice[], choice: FirstVaccineChoice): FirstVaccineChoice[] {
  if (choice === 'unknown') return vaccines.includes('unknown') ? [] : ['unknown']
  const without = vaccines.filter((value) => value !== 'unknown' && value !== choice)
  return vaccines.includes(choice) ? without : [...without, choice]
}

/**
 * The records to create. Vaccinations of one day share a record; each gets
 * its next date a year on, unless that has passed — then none, as the
 * vaccination form does. The same answers always give the same requests, so
 * a repeated «Сохранить» with the screen's keys repeats rather than adds.
 */
export function firstStepsRequests(draft: FirstStepsDraft, species: PetSpecies, today: string): FirstStepsRequests {
  const chosen = draft.vaccines.filter((choice): choice is FirstVaccine => choice !== 'unknown')
  const byDay = new Map<string, FirstVaccine[]>()
  let withoutDate = false

  for (const choice of chosen) {
    const day = draft.dates[choice]?.trim() ?? ''
    if (day === '') {
      withoutDate = true
      continue
    }
    if (!CalendarDateSchema.safeParse(day).success || day > today) return { ok: false, choice }
    byDay.set(day, [...(byDay.get(day) ?? []), choice])
  }

  const events: HealthEventInput[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, choices]) => ({
      kind: 'vaccination',
      status: 'done',
      date,
      items: choices.map((choice) => {
        const next = addMonths(date, 12)
        return { name: null, targets: vaccineTargets(species, choice), next_on: next >= today ? next : null }
      }),
    }))

  return {
    ok: true,
    events,
    vaccinatedWithoutDate: withoutDate,
    offerCheckup: draft.lastVisit === 'never' || draft.lastVisit === 'overYear',
  }
}
