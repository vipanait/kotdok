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

export interface AdminStatistics {
  days: AdminStatisticsPeriod
  totals: AdminStatisticsTotals
  daily: AdminStatisticsDailyPoint[]
}
