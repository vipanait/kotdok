import type { PaymentProviderName } from '@/types/billing'
import type { PaymentProvider } from './provider'
import { DummyProvider } from './dummy'

let dummySingleton: DummyProvider | null = null

export function isDummyProviderEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_DUMMY_PAYMENTS === 'true'
}

export function getProvider(name: PaymentProviderName): PaymentProvider {
  switch (name) {
    case 'dummy': {
      if (!isDummyProviderEnabled()) {
        throw new Error('Dummy payment provider is disabled')
      }
      if (!dummySingleton) dummySingleton = new DummyProvider()
      return dummySingleton
    }
    default:
      throw new Error(`Payment provider not configured: ${name}`)
  }
}
