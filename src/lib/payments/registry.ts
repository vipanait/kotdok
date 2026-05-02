import type { PaymentProviderName } from '@/types/billing'
import type { PaymentProvider } from './provider'
import { DummyProvider } from './dummy'

let dummySingleton: DummyProvider | null = null

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (explicit) return explicit
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000'
  return 'https://lapka.my'
}

export function getProvider(name: PaymentProviderName): PaymentProvider {
  switch (name) {
    case 'dummy': {
      if (!dummySingleton) dummySingleton = new DummyProvider(siteUrl())
      return dummySingleton
    }
    default:
      throw new Error(`Payment provider not configured: ${name}`)
  }
}
