import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'История операций',
  robots: { index: false, follow: false },
}

export default async function BillingPage() {
  redirect('/dashboard')
}
