import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import type {
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

interface TransactionRow {
  user_id: string
  amount: number | string | null
  currency: string | null
  created_at: string
  updated_at: string | null
  current_status_event_id: string | null
}

interface TransactionStatusEventRow {
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
  const [profilesResult, transactionsResult, symptomChecksResult, petsResult] = await Promise.all([
    supabase.from('profiles').select('id, created_at'),
    supabase
      .from('transactions')
      .select('user_id, amount, currency, created_at, updated_at, current_status_event_id')
      .eq('current_status', 'succeeded'),
    supabase
      .from('symptom_checks')
      .select('user_id, created_at, pet_id')
      .is('deleted_at', null),
    supabase
      .from('pets')
      .select('id, species')
      .is('deleted_at', null),
  ])

  ensureNoError(profilesResult.error, 'profiles')
  ensureNoError(transactionsResult.error, 'transactions')
  ensureNoError(symptomChecksResult.error, 'symptom checks')
  ensureNoError(petsResult.error, 'pets')

  const transactions = (transactionsResult.data ?? []) as TransactionRow[]
  const successEventDates = await loadSuccessEventDates(supabase, transactions)
  const pets = (petsResult.data ?? []) as PetRow[]
  const speciesByPetId = new Map(pets.map(p => [p.id, p.species === 'dog' ? 'dog' : 'cat']))

  return buildAdminStatistics({
    days,
    profiles: (profilesResult.data ?? []) as ProfileRow[],
    transactions,
    symptomChecks: (symptomChecksResult.data ?? []) as SymptomCheckRow[],
    successEventDates,
    speciesByPetId,
    pets,
  })
}

async function loadSuccessEventDates(
  supabase: ReturnType<typeof createServiceClient>,
  transactions: TransactionRow[],
): Promise<Map<string, string>> {
  const eventIds = Array.from(new Set(
    transactions.map(tx => tx.current_status_event_id).filter((id): id is string => Boolean(id)),
  ))

  if (!eventIds.length) return new Map()

  const { data, error } = await supabase
    .from('transaction_status_events')
    .select('id, created_at')
    .in('id', eventIds)
    .eq('status', 'succeeded')

  ensureNoError(error, 'transaction status events')

  return new Map(
    ((data ?? []) as TransactionStatusEventRow[]).map(event => [event.id, event.created_at]),
  )
}

function buildAdminStatistics({
  days,
  profiles,
  transactions,
  symptomChecks,
  successEventDates,
  speciesByPetId,
  pets,
}: {
  days: AdminStatisticsPeriod
  profiles: ProfileRow[]
  transactions: TransactionRow[]
  symptomChecks: SymptomCheckRow[]
  successEventDates: Map<string, string>
  speciesByPetId: Map<string, string>
  pets: PetRow[]
}): AdminStatistics {
  const dayKeys = buildDayKeys(days)
  const daily = new Map(dayKeys.map(date => [date, {
    date,
    registrations: 0,
    payments: 0,
    paymentAmount: 0,
    symptomChecks: 0,
    symptomChecksCat: 0,
    symptomChecksDog: 0,
  } satisfies AdminStatisticsDailyPoint]))
  const payingUsers = new Set<string>()
  const symptomCheckUsers = new Set<string>()
  let symptomChecksTotal = 0
  let symptomChecksCat = 0
  let symptomChecksDog = 0
  let totalRevenue = 0
  let currency = 'RUB'

  for (const profile of profiles) {
    const point = daily.get(toDateKey(profile.created_at))
    if (point) point.registrations += 1
  }

  for (const transaction of transactions) {
    payingUsers.add(transaction.user_id)
    const amount = toNumber(transaction.amount)
    totalRevenue += amount
    if (transaction.currency) currency = transaction.currency

    const paidAt = transaction.current_status_event_id
      ? successEventDates.get(transaction.current_status_event_id)
      : null
    const point = daily.get(toDateKey(paidAt ?? transaction.updated_at ?? transaction.created_at))
    if (point) {
      point.payments += 1
      point.paymentAmount += amount
    }
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
    currency,
    totals: {
      registeredUsers: profiles.length,
      payingUsers: payingUsers.size,
      symptomCheckUsers: symptomCheckUsers.size,
      symptomChecks: symptomChecksTotal,
      symptomChecksCat,
      symptomChecksDog,
      petsTotal: pets.length,
      petsCat,
      petsDog,
      totalRevenue,
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

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function ensureNoError(error: { message?: string } | null | undefined, label: string): void {
  if (error) {
    throw new Error(`Failed to load admin statistics ${label}: ${error.message ?? 'unknown error'}`)
  }
}
