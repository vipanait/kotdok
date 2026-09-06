import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Пополнить',
  robots: { index: false, follow: false },
}

export default async function PricingPage() {
  redirect('/dashboard')
}
