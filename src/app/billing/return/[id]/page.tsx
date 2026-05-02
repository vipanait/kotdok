import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReturnClient from './ReturnClient'

export const metadata: Metadata = {
  title: 'Оплата — КотДок',
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
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-2xl font-bold">🐱 КотДок</Link>
      </div>

      <ReturnClient transactionId={id} />
    </div>
  )
}
