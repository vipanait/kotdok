// Mock payment provider used in development. The "hosted page" lives at
// /billing/dummy/[transaction_id]; clicking "Pay" there hits our own webhook
// at /api/billing/webhook/dummy with a simple JSON body, simulating what a
// real PSP (Tinkoff, Stripe, ...) would do server-to-server.

import type {
  ChargeSavedInput,
  ChargeSavedResult,
  InitPaymentInput,
  InitPaymentResult,
  PaymentProvider,
  ProviderWebhookEvent,
} from './provider'

export interface DummyWebhookPayload {
  providerPaymentId: string
  status: 'succeeded' | 'failed' | 'canceled'
  reason?: string
  /** When set, treated as a "saved card" id on first success. */
  rebillId?: string
  cardLast4?: string
  cardBrand?: string
  cardExpMonth?: number
  cardExpYear?: number
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export class DummyProvider implements PaymentProvider {
  readonly name = 'dummy' as const

  constructor(private readonly siteUrl: string) {}

  async initPayment(input: InitPaymentInput): Promise<InitPaymentResult> {
    const providerPaymentId = randomId('dummy')
    // Hosted "checkout" page that lets the user choose pay/fail/cancel.
    const redirectUrl = `${this.siteUrl}/billing/dummy/${input.transactionId}?save=${input.savePaymentMethod ? '1' : '0'}`
    return { providerPaymentId, redirectUrl }
  }

  async chargeSaved(_input: ChargeSavedInput): Promise<ChargeSavedResult> {
    // For saved-card flow there is no UI; the API route will trigger the
    // webhook itself after marking the transaction pending.
    return { providerPaymentId: randomId('dummy') }
  }

  async parseWebhook(rawBody: string): Promise<ProviderWebhookEvent | null> {
    let body: DummyWebhookPayload
    try {
      body = JSON.parse(rawBody) as DummyWebhookPayload
    } catch {
      throw new Error('invalid_json')
    }
    if (!body?.providerPaymentId || !body?.status) {
      throw new Error('missing_fields')
    }

    return {
      providerPaymentId: body.providerPaymentId,
      providerEventId: `dummy:${body.providerPaymentId}:${body.status}`,
      status: body.status,
      reason: body.reason,
      rebillId: body.rebillId,
      cardLast4: body.cardLast4,
      cardBrand: body.cardBrand,
      cardExpMonth: body.cardExpMonth,
      cardExpYear: body.cardExpYear,
      payload: body as unknown,
    }
  }
}
