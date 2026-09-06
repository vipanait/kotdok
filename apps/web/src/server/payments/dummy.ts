// Mock payment provider used in development. The "hosted page" lives at
// /billing/dummy/[transaction_id]; clicking "Pay" there hits our own webhook
// at /api/billing/webhook/dummy with a simple JSON body, simulating what a
// real PSP would do server-to-server.

import 'server-only'

import { randomUUID } from 'crypto'
import type {
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
  return `${prefix}_${randomUUID()}`
}

function isLocalRequest(headers?: Headers): boolean {
  const host = headers?.get('x-forwarded-host') ?? headers?.get('host') ?? ''
  if (host.startsWith('[::1]')) return true
  const hostname = host.split(':')[0]
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export class DummyProvider implements PaymentProvider {
  readonly name = 'dummy' as const

  async initPayment(input: InitPaymentInput): Promise<InitPaymentResult> {
    const providerPaymentId = randomId('dummy')
    // Hosted "checkout" page that lets the user choose pay/fail/cancel.
    // Returned as a relative URL so the browser stays on the current origin
    // (otherwise on Vercel previews we'd jump to VERCEL_URL and lose cookies).
    const redirectUrl = `/billing/dummy/${input.transactionId}?save=${input.savePaymentMethod ? '1' : '0'}`
    return { providerPaymentId, redirectUrl }
  }

  async chargeSaved(): Promise<ChargeSavedResult> {
    // For saved-card flow there is no UI; the API route will trigger the
    // webhook itself after marking the transaction pending.
    return { providerPaymentId: randomId('dummy') }
  }

  async parseWebhook(rawBody: string, headers?: Headers): Promise<ProviderWebhookEvent | null> {
    const secret = process.env.DUMMY_WEBHOOK_SECRET
    if (secret) {
      const providedSecret = headers?.get('x-dummy-webhook-secret')
      if (providedSecret !== secret) throw new Error('invalid_signature')
    } else if (process.env.NODE_ENV === 'production' || !isLocalRequest(headers)) {
      throw new Error('dummy_webhook_secret_required')
    }

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
