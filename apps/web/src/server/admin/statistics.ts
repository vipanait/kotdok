import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import type {
  AdminFollowupRow,
  AdminFollowupStatistics,
  AdminStatistics,
  AdminStatisticsDailyPoint,
  AdminStatisticsPeriod,
} from '@/shared/types/admin'

const DEFAULT_PERIOD: AdminStatisticsPeriod = 30
const ALLOWED_PERIODS = [7, 30, 90] as const
const DAY_MS = 24 * 60 * 60 * 1000

interface ProfileRow {
  id: string
  created_at: string
}

interface SymptomCheckRow {
  user_id: string
  created_at: string
  pet_id: string | null
}

interface PetRow {
  id: string
  species: string | null
}

export function normalizeAdminStatisticsPeriod(value: unknown): AdminStatisticsPeriod {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw

  return ALLOWED_PERIODS.includes(parsed as AdminStatisticsPeriod)
    ? parsed as AdminStatisticsPeriod
    : DEFAULT_PERIOD
}

export async function getAdminStatistics(days: AdminStatisticsPeriod): Promise<AdminStatistics> {
  const supabase = createServiceClient()
  const now = Date.now()
  const [profilesResult, symptomChecksResult, petsResult, followupResult] = await Promise.all([
    supabase.from('profiles').select('id, created_at'),
    supabase
      .from('symptom_checks')
      .select('user_id, created_at, pet_id')
      .is('deleted_at', null),
    supabase
      .from('pets')
      .select('id, species')
      .is('deleted_at', null),
    // The follow-up loop is counted in SQL: a plain select stops at max_rows.
    supabase.rpc('admin_followup_statistics', {
      p_from: new Date(now - days * DAY_MS).toISOString(),
      p_to: new Date(now + DAY_MS).toISOString(),
    }),
  ])

  ensureNoError(profilesResult.error, 'profiles')
  ensureNoError(symptomChecksResult.error, 'symptom checks')
  ensureNoError(petsResult.error, 'pets')
  ensureNoError(followupResult.error, 'follow-up')

  const pets = (petsResult.data ?? []) as PetRow[]
  const speciesByPetId = new Map(pets.map(p => [p.id, p.species === 'dog' ? 'dog' : 'cat']))

  return {
    ...buildAdminStatistics({
      days,
      profiles: (profilesResult.data ?? []) as ProfileRow[],
      symptomChecks: (symptomChecksResult.data ?? []) as SymptomCheckRow[],
      speciesByPetId,
      pets,
    }),
    followup: mapFollowupStatistics(followupResult.data),
  }
}

const FOLLOWUP_ORDER: AdminFollowupRow['urgency'][] = ['monitor', 'home_care', 'urgent', 'emergency']

/** The SQL function's rows, in the order of the scale, every urgency present. */
export function mapFollowupStatistics(raw: unknown): AdminFollowupStatistics {
  const data = (raw ?? {}) as { by_urgency?: Record<string, unknown>[]; first_source?: Record<string, number> }
  const rows = new Map((data.by_urgency ?? []).map(row => [String(row.urgency), row]))
  const n = (row: Record<string, unknown> | undefined, key: string) => Number(row?.[key] ?? 0)
  return {
    rows: FOLLOWUP_ORDER.map(urgency => {
      const row = rows.get(urgency)
      const median = row?.median_hours_to_better
      return {
        urgency,
        offered: n(row, 'offered'),
        enabled: n(row, 'enabled'),
        answered: n(row, 'answered'),
        firstBetter: n(row, 'first_better'),
        firstSame: n(row, 'first_same'),
        firstWorse: n(row, 'first_worse'),
        escalated: n(row, 'escalated'),
        firstVetAsked: n(row, 'first_vet_asked'),
        firstVetYes: n(row, 'first_vet_yes'),
        anyWorse: n(row, 'any_worse'),
        rechecked: n(row, 'rechecked'),
        recheckRaised: n(row, 'recheck_raised'),
        outcomes: {
          improved: n(row, 'outcome_improved'),
          vetSeen: n(row, 'outcome_vet_seen'),
          unresolved: n(row, 'outcome_unresolved'),
          dismissed: n(row, 'outcome_dismissed'),
          expired: n(row, 'outcome_expired'),
          superseded: n(row, 'outcome_superseded'),
        },
        open: n(row, 'open'),
        savedToRecord: n(row, 'saved_to_record'),
        medianHoursToBetter: median === null || median === undefined ? null : Math.round(Number(median) * 10) / 10,
      }
    }),
    firstSource: { ...(data.first_source ?? {}) },
  }
}

function buildAdminStatistics({
  days,
  profiles,
  symptomChecks,
  speciesByPetId,
  pets,
}: {
  days: AdminStatisticsPeriod
  profiles: ProfileRow[]
  symptomChecks: SymptomCheckRow[]
  speciesByPetId: Map<string, string>
  pets: PetRow[]
}): Omit<AdminStatistics, 'followup'> {
  const dayKeys = buildDayKeys(days)
  const daily = new Map(dayKeys.map(date => [date, {
    date,
    registrations: 0,
    symptomChecks: 0,
    symptomChecksCat: 0,
    symptomChecksDog: 0,
  } satisfies AdminStatisticsDailyPoint]))
  const symptomCheckUsers = new Set<string>()
  let symptomChecksTotal = 0
  let symptomChecksCat = 0
  let symptomChecksDog = 0

  for (const profile of profiles) {
    const point = daily.get(toDateKey(profile.created_at))
    if (point) point.registrations += 1
  }

  for (const symptomCheck of symptomChecks) {
    symptomCheckUsers.add(symptomCheck.user_id)
    symptomChecksTotal += 1
    const species = symptomCheck.pet_id ? speciesByPetId.get(symptomCheck.pet_id) : null
    if (species === 'dog') symptomChecksDog += 1
    else symptomChecksCat += 1

    const point = daily.get(toDateKey(symptomCheck.created_at))
    if (point) {
      point.symptomChecks += 1
      if (species === 'dog') point.symptomChecksDog += 1
      else point.symptomChecksCat += 1
    }
  }

  const petsCat = pets.filter(p => p.species !== 'dog').length
  const petsDog = pets.filter(p => p.species === 'dog').length

  return {
    days,
    totals: {
      registeredUsers: profiles.length,
      symptomCheckUsers: symptomCheckUsers.size,
      symptomChecks: symptomChecksTotal,
      symptomChecksCat,
      symptomChecksDog,
      petsTotal: pets.length,
      petsCat,
      petsDog,
    },
    daily: Array.from(daily.values()),
  }
}

function buildDayKeys(days: AdminStatisticsPeriod): string[] {
  const end = startOfUtcDay(new Date())
  const startTime = end.getTime() - (days - 1) * DAY_MS

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startTime + index * DAY_MS)
    return date.toISOString().slice(0, 10)
  })
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function toDateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10)
}

function ensureNoError(error: { message?: string } | null | undefined, label: string): void {
  if (error) {
    throw new Error(`Failed to load admin statistics ${label}: ${error.message ?? 'unknown error'}`)
  }
}
