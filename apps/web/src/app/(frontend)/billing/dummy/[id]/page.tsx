import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Тестовая оплата',
  robots: { index: false, follow: false },
}

export default async function DummyCheckoutPage({
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ save?: string }>
}) {
  redirect('/dashboard')
}
