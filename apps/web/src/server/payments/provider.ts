import 'server-only'

import type { PaymentProviderName } from '@/shared/types/billing'

export interface InitPaymentInput {
  transactionId: string
  userId: string
  amountCents: number
  currency: string
  description: string
  returnUrl: string
  savePaymentMethod: boolean
}

export interface InitPaymentResult {
  providerPaymentId: string
  /** URL the user should be redirected to to enter card data. */
  redirectUrl?: string
}

export interface ChargeSavedInput {
  transactionId: string
  userId: string
  amountCents: number
  currency: string
  description: string
  /** Provider-specific saved-card token (e.g. recurring billing id). */
  providerPmId: string
}

export interface ChargeSavedResult {
  providerPaymentId: string
}

/** Normalized webhook event emitted by a provider. */
export interface ProviderWebhookEvent {
  providerPaymentId: string
  /** Stable id for idempotency. Synthesize one if the PSP doesn't provide it. */
  providerEventId: string
  status: 'succeeded' | 'failed' | 'canceled' | 'authorized'
  reason?: string
  /** Tokenized saved-card id, present when a card is saved (first recurrent payment). */
  rebillId?: string
  cardLast4?: string
  cardBrand?: string
  cardExpMonth?: number
  cardExpYear?: number
  payload: unknown
}

export interface PaymentProvider {
  readonly name: PaymentProviderName
  initPayment(input: InitPaymentInput): Promise<InitPaymentResult>
  chargeSaved(input: ChargeSavedInput): Promise<ChargeSavedResult>
  /**
   * Verifies signature and parses the notification body.
   * Returns null for events we choose to ignore (e.g. intermediate "form shown" notifications).
   * Throws on signature mismatch.
   */
  parseWebhook(rawBody: string, headers?: Headers): Promise<ProviderWebhookEvent | null>
}
