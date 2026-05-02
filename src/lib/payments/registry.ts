import type { PaymentProviderName } from '@/types/billing'
import type { PaymentProvider } from './provider'
import { DummyProvider } from './dummy'

let dummySingleton: DummyProvider | null = null

export function getProvider(name: PaymentProviderName): PaymentProvider {
  switch (name) {
    case 'dummy': {
      if (!dummySingleton) dummySingleton = new DummyProvider()
      return dummySingleton
    }
    default:
      throw new Error(`Payment provider not configured: ${name}`)
  }
}
