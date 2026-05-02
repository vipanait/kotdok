import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/server/supabase/server'
import ReturnClient from '@/features/billing/ReturnClient'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Оплата',
  robots: { index: false, follow: false },
}

export default async function BillingReturnPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/billing/return/${id}`)

  return (
    <AppShell>
      <ReturnClient transactionId={id} />
    </AppShell>
  )
}
