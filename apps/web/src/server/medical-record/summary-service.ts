import 'server-only'

import {
  PARASITE_TARGETS,
  VACCINE_TARGETS,
  VetSummarySchema,
  type HealthEvent,
  type Medication,
  type Pet,
  type VetSummary,
  type WeightMeasurement,
} from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import { getHealthOverview } from './overview-service'
import { utcToday } from './weight-service'
import type { PetResult } from '@/server/pets/pet-service'

type SupabaseService = ReturnType<typeof createServiceClient>

const CHECKS_SHOWN = 3
const WEIGHTS_SHOWN = 5
const SUMMARY_LINE_MAX = 200

const PARASITE_ROWS = [
  { group: 'fleas_ticks', covers: ['fleas', 'ticks'] },
  { group: 'worms', covers: ['worms'] },
] as const

function groupOf(code: string): string | undefined {
  return PARASITE_TARGETS.find((target) => target.code === code)?.group
}

function yearBefore(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year - 1, month - 1, date)).toISOString().slice(0, 10)
}

type Item = HealthEvent['items'][number]
type Found = { event: HealthEvent; item: Item }

/** The latest done and the earliest planned item among those that match. */
function lastAndNext(events: readonly HealthEvent[], kind: HealthEvent['kind'], matches: (item: Item) => boolean) {
  let last: Found | null = null
  let next: Found | null = null
  for (const event of events) {
    if (event.kind !== kind) continue
    for (const item of event.items) {
      if (!matches(item)) continue
      if (event.status === 'done' && (!last || event.date > last.event.date)) last = { event, item }
      if (event.status === 'planned' && (!next || event.date < next.event.date)) next = { event, item }
    }
  }
  return {
    last_done: last?.event.date ?? null,
    product: last?.item.name ?? null,
    next: next?.event.date ?? null,
  }
}

/**
 * The summary from what the medical record already holds. Pure: the same
 * record always gives the same summary, so the screen and the PDF agree.
 */
export function summarise(input: {
  pet: Pet
  weights: readonly WeightMeasurement[]
  events: readonly HealthEvent[]
  medications: readonly Medication[]
  checks: readonly { id: string; created_at: string; urgency: string; symptoms_input: string }[]
  today: string
}): VetSummary {
  const { pet, events, today } = input
  const species = pet.species

  const recorded = new Set(
    events.filter((event) => event.kind === 'vaccination').flatMap((event) => event.items.flatMap((item) => item.targets)),
  )
  const targets = [
    ...VACCINE_TARGETS.filter((target) => target.core && (target.species as readonly string[]).includes(species)),
    ...VACCINE_TARGETS.filter((target) => !(target.core && (target.species as readonly string[]).includes(species)) && recorded.has(target.code)),
  ]

  const since = yearBefore(today)

  return VetSummarySchema.parse({
    generated_on: today,
    pet,
    // Dated measurements only; the form's undated weight is the pet's own `weight_kg`.
    weights: input.weights
      .filter((weight) => weight.measured_on !== null)
      .sort((a, b) => (b.measured_on ?? '').localeCompare(a.measured_on ?? ''))
      .slice(0, WEIGHTS_SHOWN),
    medications: input.medications.filter(
      (course) => (course.started_on === null || course.started_on <= today) && (course.ended_on === null || course.ended_on > today),
    ),
    vaccinations: targets.map((target) => ({
      target: target.code,
      core: target.core && (target.species as readonly string[]).includes(species),
      ...lastAndNext(events, 'vaccination', (item) => (item.targets as readonly string[]).includes(target.code)),
    })),
    parasites: PARASITE_ROWS.map((row) => ({
      group: row.group,
      ...lastAndNext(events, 'parasite', (item) =>
        item.targets.some((code) => (row.covers as readonly string[]).includes(groupOf(code) ?? '')),
      ),
    })),
    visits: events
      .filter((event) => event.kind === 'visit' && event.status === 'done' && event.date >= since && event.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date)),
    checks: input.checks.slice(0, CHECKS_SHOWN).map((check) => ({
      id: check.id,
      created_at: check.created_at,
      urgency: check.urgency,
      summary: (check.symptoms_input.split('\n').find((line) => line.trim() !== '') ?? '').trim().slice(0, SUMMARY_LINE_MAX),
    })),
  })
}

/**
 * «Для врача» for one pet of the caller. Ownership and the account's state
 * come from the overview, so the summary is never wider than the record the
 * caller may already read; checks are this pet's, the caller's, not deleted.
 */
export async function getVetSummary(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  today: string = utcToday(),
): Promise<PetResult<VetSummary>> {
  const overview = await getHealthOverview(supabase, userId, petId)
  if (!overview.ok) return overview

  const { data: checks, error } = await supabase
    .from('symptom_checks')
    .select('id, created_at, urgency, symptoms_input')
    .eq('user_id', userId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHECKS_SHOWN)
  if (error) return { ok: false, reason: 'storage_error', message: error.message }

  return {
    ok: true,
    data: summarise({
      pet: overview.data.pet,
      weights: overview.data.weights,
      events: overview.data.events,
      medications: overview.data.medications,
      checks: (checks ?? []).map((check) => ({
        id: check.id as string,
        // The column has no zone; it is UTC.
        created_at: toUtcIso(check.created_at as string),
        urgency: check.urgency as string,
        symptoms_input: (check.symptoms_input as string | null) ?? '',
      })),
      today,
    }),
  }
}
