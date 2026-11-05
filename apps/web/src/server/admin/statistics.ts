import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import {
  ADMIN_URGENCIES,
  type AdminCheckFeedFilter,
  type AdminCheckRow,
  type AdminChecks,
  type AdminFeed,
  type AdminFeedback,
  type AdminFeedbackFeedFilter,
  type AdminFeedbackRow,
  type AdminFollowupRow,
  type AdminFollowupStatistics,
  type AdminOverview,
  type AdminStatisticsPeriod,
  type AdminUsers,
} from '@/shared/types/admin'
import {
  asObject,
  toCheckRow,
  toCounts,
  toDaily,
  toFeed,
  toFeedbackRow,
  toMetric,
  toNumber,
  toOpenCounts,
  toRatio,
} from './map'

const DEFAULT_PERIOD: AdminStatisticsPeriod = 30
const ALLOWED_PERIODS = [7, 30, 90] as const
const DAY_MS = 24 * 60 * 60 * 1000

export const FEED_STEP = 50
const FEED_MAX = 500

/** How many feed rows to show: a multiple of 50, from 50 to 500. */
export function normalizeFeedShown(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed) || parsed < FEED_STEP) return FEED_STEP
  return Math.min(FEED_MAX, Math.floor(parsed / FEED_STEP) * FEED_STEP)
}

export function normalizeCheckFeedFilter(value: unknown): AdminCheckFeedFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'urgent' || raw === 'disliked' ? raw : 'all'
}

export function normalizeFeedbackFeedFilter(value: unknown): AdminFeedbackFeedFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'liked' || raw === 'disliked' ? raw : 'all'
}

/** One admin SQL function; its error becomes an exception naming it. */
async function callAdmin(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createServiceClient().rpc(name, args)
  if (error) throw new Error(`Failed to load admin statistics ${name}: ${error.message ?? 'unknown error'}`)
  return data
}

function windowArgs(days: AdminStatisticsPeriod, now: Date) {
  return { p_now: now.toISOString(), p_days: days }
}

export async function getAdminOverview(days: AdminStatisticsPeriod, now = new Date()): Promise<AdminOverview> {
  const raw = asObject(await callAdmin('admin_overview_stats', windowArgs(days, now)))
  return {
    days,
    newUsers: toMetric(raw.new_users),
    active7d: toMetric(raw.active_7d),
    checks: toMetric(raw.checks),
    helpful: toRatio(raw.helpful),
    failures: toRatio(raw.failures),
    extraRequests: toMetric(raw.extra_requests),
    daily: toDaily(raw.daily, ['registrations', 'checks'] as const),
  }
}

export async function getAdminUsers(days: AdminStatisticsPeriod, now = new Date()): Promise<AdminUsers> {
  const raw = asObject(await callAdmin('admin_users_stats', windowArgs(days, now)))
  const dau = asObject(raw.dau_avg)
  return {
    days,
    accounts: toCounts(raw.accounts, ['total', 'added'] as const),
    dauAvg: { cur: toNumber(dau.cur), prev: dau.prev === null || dau.prev === undefined ? null : toNumber(dau.prev) },
    active7d: toMetric(raw.active_7d),
    activation: toRatio(raw.activation),
    returning: toRatio(raw.returning),
    daily: toDaily(raw.daily, ['registrations', 'active'] as const),
    providers: toOpenCounts(raw.providers),
    locales: toOpenCounts(raw.locales),
    cohorts: (Array.isArray(raw.cohorts) ? raw.cohorts : []).map(item => {
      const cohort = asObject(item)
      return {
        weekStart: String(cohort.week_start ?? ''),
        size: toNumber(cohort.size),
        active: (Array.isArray(cohort.active) ? cohort.active : []).map(n => (n === null ? null : toNumber(n))),
      }
    }),
  }
}

export async function getAdminChecks(days: AdminStatisticsPeriod, now = new Date()): Promise<AdminChecks> {
  const [stats, followup] = await Promise.all([
    callAdmin('admin_checks_stats', windowArgs(days, now)),
    callAdmin('admin_followup_statistics', {
      p_from: new Date(now.getTime() - days * DAY_MS).toISOString(),
      p_to: new Date(now.getTime() + DAY_MS).toISOString(),
    }),
  ])
  const raw = asObject(stats)
  const answers = asObject(raw.answers)
  return {
    days,
    checks: toMetric(raw.checks),
    species: toCounts(raw.species, ['cat', 'dog', 'unknown'] as const),
    perUser: toRatio(raw.per_user),
    failures: toRatio(raw.failures),
    failureCodes: toOpenCounts(raw.failure_codes),
    extraRequests: toMetric(raw.extra_requests),
    extraApproved: toNumber(raw.extra_approved),
    daily: toDaily(raw.daily, ADMIN_URGENCIES),
    answers: {
      total: toNumber(answers.total),
      appetite: toCounts(answers.appetite, ['normal', 'reduced', 'none', 'unanswered'] as const),
      activity: toCounts(answers.activity, ['normal', 'low', 'lethargic', 'unanswered'] as const),
      duration: toCounts(answers.duration, ['today', '2-3days', '4-7days', 'week+', 'unanswered'] as const),
      stool: toCounts(answers.stool, ['normal', 'loose', 'absent', 'bloody', 'unanswered'] as const),
      pain: toCounts(answers.pain, ['tense', 'hunched', 'grimace', 'touch_sensitive', 'hiding', 'vocalizing', 'any'] as const),
    },
    followup: mapFollowupStatistics(followup),
  }
}

export async function getAdminFeedback(days: AdminStatisticsPeriod, now = new Date()): Promise<AdminFeedback> {
  const raw = asObject(await callAdmin('admin_feedback_stats', windowArgs(days, now)))
  const byUrgency = asObject(raw.by_urgency)
  return {
    days,
    ratings: toMetric(raw.ratings),
    liked: toRatio(raw.liked),
    ratedChecks: toRatio(raw.rated_checks),
    withComment: toMetric(raw.with_comment),
    daily: toDaily(raw.daily, ['liked', 'disliked'] as const),
    byUrgency: Object.fromEntries(
      ADMIN_URGENCIES.map(urgency => [urgency, toCounts(byUrgency[urgency], ['liked', 'rated'] as const)]),
    ) as AdminFeedback['byUrgency'],
  }
}

export async function getAdminCheckFeed(
  days: AdminStatisticsPeriod,
  filter: AdminCheckFeedFilter,
  shown: number,
  now = new Date(),
): Promise<AdminFeed<AdminCheckRow>> {
  const raw = await callAdmin('admin_check_feed', { ...windowArgs(days, now), p_filter: filter, p_limit: shown })
  return toFeed(raw, toCheckRow)
}

export async function getAdminFeedbackFeed(
  days: AdminStatisticsPeriod,
  filter: AdminFeedbackFeedFilter,
  shown: number,
  now = new Date(),
): Promise<AdminFeed<AdminFeedbackRow>> {
  const raw = await callAdmin('admin_feedback_feed', { ...windowArgs(days, now), p_filter: filter, p_limit: shown })
  return toFeed(raw, toFeedbackRow)
}

export function normalizeAdminStatisticsPeriod(value: unknown): AdminStatisticsPeriod {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw

  return ALLOWED_PERIODS.includes(parsed as AdminStatisticsPeriod)
    ? parsed as AdminStatisticsPeriod
    : DEFAULT_PERIOD
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
