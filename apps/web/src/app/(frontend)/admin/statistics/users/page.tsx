import CabinetShell from '@/components/cabinet/CabinetShell'
import AdminFrame from '@/features/admin/AdminFrame'
import UsersTab from '@/features/admin/UsersTab'
import { getAdminUsers } from '@/server/admin/statistics'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { loadAdminPage, type AdminSearchParams } from '../load-admin-page'

export const generateMetadata = privatePageMetadata(d => d.shell.statistics)

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const { cabinet, days } = await loadAdminPage('users', searchParams)
  const dict = await getDictionary(await getLocale())
  const users = await getAdminUsers(days)

  return (
    <CabinetShell cabinet={cabinet} crumb={dict.admin.statistics.crumb}>
      <AdminFrame tab="users" days={days}>
        <UsersTab users={users} />
      </AdminFrame>
    </CabinetShell>
  )
}
