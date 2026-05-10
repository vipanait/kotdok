export type AdminStatisticsPeriod = 7 | 30 | 90

export interface AdminStatisticsTotals {
  registeredUsers: number
  payingUsers: number
  symptomCheckUsers: number
  symptomChecks: number
  totalRevenue: number
}

export interface AdminStatisticsDailyPoint {
  date: string
  registrations: number
  payments: number
  paymentAmount: number
  symptomChecks: number
}

export interface AdminStatistics {
  days: AdminStatisticsPeriod
  currency: string
  totals: AdminStatisticsTotals
  daily: AdminStatisticsDailyPoint[]
}
