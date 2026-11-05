import type { AdminStatisticsPeriod } from '@/shared/types/admin'

export const ADMIN_TABS = ['overview', 'users', 'checks', 'feedback'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

const PATHS: Record<AdminTab, string> = {
  overview: '/admin/statistics',
  users: '/admin/statistics/users',
  checks: '/admin/statistics/checks',
  feedback: '/admin/statistics/feedback',
}

/** A tab's address with the period first, then any feed parameters in the order given. */
export function adminTabHref(tab: AdminTab, days: AdminStatisticsPeriod, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ days: String(days), ...extra })
  return `${PATHS[tab]}?${query.toString()}`
}
