import type { PaymentProviderName } from '@/types/billing'
import type { PaymentProvider } from './provider'
import { TinkoffProvider } from './tinkoff'

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

let tinkoffSingleton: TinkoffProvider | null = null

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://kotdok.vercel.app'
}

export function getProvider(name: PaymentProviderName): PaymentProvider {
  switch (name) {
    case 'tinkoff': {
      if (!tinkoffSingleton) {
        tinkoffSingleton = new TinkoffProvider(
          mustEnv('TINKOFF_TERMINAL_KEY'),
          mustEnv('TINKOFF_PASSWORD'),
          `${siteUrl()}/api/billing/webhook/tinkoff`,
        )
      }
      return tinkoffSingleton
    }
    default:
      throw new Error(`Payment provider not configured: ${name}`)
  }
}
