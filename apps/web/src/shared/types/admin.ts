export type AdminStatisticsPeriod = 7 | 30 | 90

export interface AdminStatisticsTotals {
  registeredUsers: number
  symptomCheckUsers: number
  symptomChecks: number
  symptomChecksCat: number
  symptomChecksDog: number
  petsTotal: number
  petsCat: number
  petsDog: number
}

export interface AdminStatisticsDailyPoint {
  date: string
  registrations: number
  symptomChecks: number
  symptomChecksCat: number
  symptomChecksDog: number
}

/** One urgency of the follow-up loop, over cases whose first check falls in the period. */
export interface AdminFollowupRow {
  urgency: 'emergency' | 'urgent' | 'monitor' | 'home_care'
  offered: number
  enabled: number
  answered: number
  firstBetter: number
  firstSame: number
  firstWorse: number
  /** The rule advised a vet at least once. */
  escalated: number
  /** «Были у врача?» asked first, and answered «да». */
  firstVetAsked: number
  firstVetYes: number
  anyWorse: number
  rechecked: number
  /** A re-check came out urgent or emergency. */
  recheckRaised: number
  outcomes: {
    improved: number
    vetSeen: number
    unresolved: number
    dismissed: number
    expired: number
    superseded: number
  }
  open: number
  savedToRecord: number
  medianHoursToBetter: number | null
}

export interface AdminFollowupStatistics {
  rows: AdminFollowupRow[]
  /** Where first answers came from: notification, pets_list, web_banner… */
  firstSource: Record<string, number>
}

export interface AdminStatistics {
  days: AdminStatisticsPeriod
  totals: AdminStatisticsTotals
  daily: AdminStatisticsDailyPoint[]
  followup: AdminFollowupStatistics
}

// --- The dashboard tabs, counted in SQL (supabase/migrations/20261105120*) ---

/** A count now and in the previous window; `prev` is null when its source did not exist yet. */
export interface AdminMetric {
  cur: number
  prev: number | null
}

export interface AdminRatioPart {
  num: number
  den: number
}

/** A share now and in the previous window, kept as counts so the page decides how to show it. */
export interface AdminRatio {
  cur: AdminRatioPart
  prev: AdminRatioPart | null
}

export const ADMIN_URGENCIES = ['emergency', 'urgent', 'monitor', 'home_care', 'healthy'] as const
export type AdminUrgency = (typeof ADMIN_URGENCIES)[number]

export type AdminDaily<K extends string> = ({ date: string } & Record<K, number>)[]

export interface AdminOverview {
  days: AdminStatisticsPeriod
  newUsers: AdminMetric
  active7d: AdminMetric
  checks: AdminMetric
  helpful: AdminRatio
  failures: AdminRatio
  extraRequests: AdminMetric
  daily: AdminDaily<'registrations' | 'checks'>
}

export interface AdminCohort {
  /** Monday of the registration week, Moscow date. */
  weekStart: string
  size: number
  /** People of the cohort active in weeks 0..4 after it; null for a week not over yet. */
  active: (number | null)[]
}

export interface AdminUsers {
  days: AdminStatisticsPeriod
  accounts: { total: number; added: number }
  dauAvg: { cur: number; prev: number | null }
  active7d: AdminMetric
  activation: AdminRatio
  returning: AdminRatio
  daily: AdminDaily<'registrations' | 'active'>
  providers: Record<string, number>
  locales: Record<string, number>
  cohorts: AdminCohort[]
}

export interface AdminAnswers {
  total: number
  appetite: Record<'normal' | 'reduced' | 'none' | 'unanswered', number>
  activity: Record<'normal' | 'low' | 'lethargic' | 'unanswered', number>
  duration: Record<'today' | '2-3days' | '4-7days' | 'week+' | 'unanswered', number>
  stool: Record<'normal' | 'loose' | 'absent' | 'bloody' | 'unanswered', number>
  pain: Record<'tense' | 'hunched' | 'grimace' | 'touch_sensitive' | 'hiding' | 'vocalizing' | 'any', number>
}

export interface AdminChecks {
  days: AdminStatisticsPeriod
  checks: AdminMetric
  species: Record<'cat' | 'dog' | 'unknown', number>
  /** num = checks, den = people who made them. */
  perUser: AdminRatio
  failures: AdminRatio
  failureCodes: Record<string, number>
  extraRequests: AdminMetric
  extraApproved: number
  daily: AdminDaily<AdminUrgency>
  answers: AdminAnswers
  followup: AdminFollowupStatistics
}

export interface AdminFeedback {
  days: AdminStatisticsPeriod
  ratings: AdminMetric
  liked: AdminRatio
  ratedChecks: AdminRatio
  withComment: AdminMetric
  daily: AdminDaily<'liked' | 'disliked'>
  byUrgency: Record<AdminUrgency, { liked: number; rated: number }>
}

export type AdminRating = 'liked' | 'disliked'

/** One check as the feeds show it: nothing that names the owner or the pet. */
export interface AdminCheckRow {
  id: string
  createdAt: string
  species: 'cat' | 'dog' | null
  petAgeYears: number | null
  symptoms: string
  urgency: AdminUrgency | null
  urgencyReason: string | null
  possibleCauses: string[]
  homeCareSteps: string[]
  vetQuestions: string[]
  answers: {
    appetite: string | null
    activity: string | null
    duration: string | null
    stool: string | null
    painSigns: string[]
  }
  rating: AdminRating | null
  comment: string | null
}

export interface AdminFeedbackRow {
  id: string
  at: string
  rating: AdminRating
  comment: string
  /** Null for feedback given before ratings belonged to a check, or when the check was deleted. */
  check: AdminCheckRow | null
}

export interface AdminFeed<T> {
  rows: T[]
  hasMore: boolean
}

export type AdminCheckFeedFilter = 'all' | 'urgent' | 'disliked'
export type AdminFeedbackFeedFilter = 'all' | 'disliked' | 'liked'
