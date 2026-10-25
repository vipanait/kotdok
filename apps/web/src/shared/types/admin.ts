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
