import 'server-only'

import { redirect } from 'next/navigation'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { adminTabHref, type AdminTab } from '@/features/admin/tabs'
import { loadAdminUser } from '@/server/auth/admin-user'
import { normalizeAdminStatisticsPeriod } from '@/server/admin/statistics'
import type { AdminStatisticsPeriod } from '@/shared/types/admin'

export type AdminSearchParams = Record<string, string | string[] | undefined>

/**
 * The guard every statistics tab runs first: somebody signed out goes to the
 * sign-in page and comes back to this tab; anybody without the admin role goes
 * to their dashboard. Then the cabinet frame's own view of the visitor, which
 * also sends away an account whose deletion has started.
 */
export async function loadAdminPage(tab: AdminTab, searchParams: Promise<AdminSearchParams>) {
  const params = await searchParams
  const days: AdminStatisticsPeriod = normalizeAdminStatisticsPeriod(params.days)
  const signIn = `/login?next=${encodeURIComponent(adminTabHref(tab, days))}`

  const admin = await loadAdminUser()
  if (!admin.ok) redirect(admin.reason === 'signed_out' ? signIn : '/dashboard')

  const cabinet = await requireCabinet(signIn)
  return { cabinet, days, params }
}
