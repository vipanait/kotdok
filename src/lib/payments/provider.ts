import type { PaymentProviderName } from '@/types/billing'

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
  /** Provider-specific saved-card id (for Tinkoff: RebillId). */
  providerPmId: string
}

export interface ChargeSavedResult {
  providerPaymentId: string
}

/** Normalized webhook event emitted by a provider. */
export interface ProviderWebhookEvent {
  providerPaymentId: string
  /** Stable id for idempotency. For Tinkoff we synthesize `${PaymentId}:${Status}`. */
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
   * Returns null for events we choose to ignore (e.g. NEW, FORM_SHOWED for Tinkoff).
   * Throws on signature mismatch.
   */
  parseWebhook(rawBody: string): Promise<ProviderWebhookEvent | null>
}
