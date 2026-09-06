import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Оплата',
  robots: { index: false, follow: false },
}

export default async function BillingReturnPage({
}: {
  params: Promise<{ id: string }>
}) {
  redirect('/dashboard')
}
