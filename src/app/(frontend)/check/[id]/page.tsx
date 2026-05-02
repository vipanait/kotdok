import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/server/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import AppShell from '@/components/AppShell'
import CheckResultContent from '@/features/symptom-check/CheckResultContent'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function CheckResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const locale = await getLocale()
  const dict = await getDictionary(locale)

  const service = createServiceClient()
  const { data: check } = await service
    .from('symptom_checks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!check) notFound()

  return (
    <AppShell right={
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">{dict.common.back}</Link>
    }>
      <CheckResultContent check={check} showBackLink />
    </AppShell>
  )
}
