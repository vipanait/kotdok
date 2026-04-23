import { createHash } from 'crypto'
import type {
  ChargeSavedInput,
  ChargeSavedResult,
  InitPaymentInput,
  InitPaymentResult,
  PaymentProvider,
  ProviderWebhookEvent,
} from './provider'

const API_BASE = 'https://securepay.tinkoff.ru/v2'

/**
 * Tinkoff Acquiring API signature: take all root-level scalar fields of the
 * request/notification body, add `Password`, sort by key, concatenate values,
 * sha256 → hex lowercase. Nested objects (Receipt, DATA) are NOT included.
 */
function computeToken(
  params: Record<string, string | number | boolean | null | undefined>,
  password: string,
): string {
  const scalarEntries: [string, string][] = []
  for (const [key, value] of Object.entries(params)) {
    if (key === 'Token') continue
    if (value === null || value === undefined) continue
    if (typeof value === 'object') continue
    scalarEntries.push([key, String(value)])
  }
  scalarEntries.push(['Password', password])
  scalarEntries.sort(([a], [b]) => a.localeCompare(b))
  const concatenated = scalarEntries.map(([, v]) => v).join('')
  return createHash('sha256').update(concatenated).digest('hex')
}

type TinkoffResponse = {
  Success: boolean
  ErrorCode: string
  Message?: string
  Details?: string
  PaymentId?: string
  Status?: string
  PaymentURL?: string
  OrderId?: string
  Amount?: number
}

async function tinkoffPost(
  path: string,
  body: Record<string, unknown>,
): Promise<TinkoffResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as TinkoffResponse
  if (!data.Success) {
    throw new Error(`Tinkoff ${path} failed: ${data.ErrorCode} ${data.Message ?? ''} ${data.Details ?? ''}`)
  }
  return data
}

/** Map Tinkoff Status to our normalized status. Unknown/intermediate → null (ignored). */
function mapStatus(status: string): ProviderWebhookEvent['status'] | null {
  switch (status) {
    case 'CONFIRMED':
      return 'succeeded'
    case 'AUTHORIZED':
      return 'authorized'
    case 'REJECTED':
    case 'DEADLINE_EXPIRED':
    case 'ATTEMPTS_EXPIRED':
      return 'failed'
    case 'CANCELED':
    case 'REVERSED':
      return 'canceled'
    default:
      // NEW, FORM_SHOWED, AUTHORIZING, CONFIRMING, REFUNDING, PARTIAL_REFUNDED, REFUNDED, etc.
      return null
  }
}

export class TinkoffProvider implements PaymentProvider {
  readonly name = 'tinkoff' as const

  constructor(
    private readonly terminalKey: string,
    private readonly password: string,
    private readonly notificationUrl: string,
  ) {}

  async initPayment(input: InitPaymentInput): Promise<InitPaymentResult> {
    const body: Record<string, string | number | boolean | object | undefined> = {
      TerminalKey: this.terminalKey,
      Amount: input.amountCents,
      OrderId: input.transactionId,
      Description: input.description.slice(0, 140),
      CustomerKey: input.userId,
      NotificationURL: this.notificationUrl,
      SuccessURL: `${input.returnUrl}?status=success`,
      FailURL: `${input.returnUrl}?status=fail`,
    }
    if (input.savePaymentMethod) body.Recurrent = 'Y'
    body.Token = computeToken(
      body as Record<string, string | number | boolean | null | undefined>,
      this.password,
    )

    const res = await tinkoffPost('/Init', body)
    if (!res.PaymentId) throw new Error('Tinkoff Init returned no PaymentId')
    return {
      providerPaymentId: res.PaymentId,
      redirectUrl: res.PaymentURL,
    }
  }

  async chargeSaved(input: ChargeSavedInput): Promise<ChargeSavedResult> {
    // For recurrent: Init without Recurrent=Y, then Charge with RebillId.
    const initBody: Record<string, string | number | boolean | undefined> = {
      TerminalKey: this.terminalKey,
      Amount: input.amountCents,
      OrderId: input.transactionId,
      Description: input.description.slice(0, 140),
      CustomerKey: input.userId,
      NotificationURL: this.notificationUrl,
    }
    initBody.Token = computeToken(initBody, this.password)
    const initRes = await tinkoffPost('/Init', initBody)
    if (!initRes.PaymentId) throw new Error('Tinkoff Init (recurrent) returned no PaymentId')

    const chargeBody: Record<string, string | number> = {
      TerminalKey: this.terminalKey,
      PaymentId: initRes.PaymentId,
      RebillId: input.providerPmId,
    }
    chargeBody.Token = computeToken(chargeBody, this.password)
    await tinkoffPost('/Charge', chargeBody)

    return { providerPaymentId: initRes.PaymentId }
  }

  async parseWebhook(rawBody: string): Promise<ProviderWebhookEvent | null> {
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody)
    } catch {
      throw new Error('invalid_json')
    }

    const receivedToken = body.Token
    if (typeof receivedToken !== 'string') throw new Error('missing_token')

    const expected = computeToken(
      body as Record<string, string | number | boolean | null | undefined>,
      this.password,
    )
    if (expected !== receivedToken) throw new Error('signature_mismatch')

    const paymentId = String(body.PaymentId ?? '')
    const status = String(body.Status ?? '')
    if (!paymentId || !status) throw new Error('missing_payment_id_or_status')

    const mapped = mapStatus(status)
    if (!mapped) return null // ignore intermediate statuses

    // Tinkoff has no event id: synthesize one that's unique per status transition.
    const providerEventId = `tinkoff:${paymentId}:${status}`

    const evt: ProviderWebhookEvent = {
      providerPaymentId: paymentId,
      providerEventId,
      status: mapped,
      reason: typeof body.ErrorCode === 'string' && body.ErrorCode !== '0' ? body.ErrorCode : undefined,
      payload: body,
    }

    if (typeof body.RebillId === 'string' && body.RebillId) evt.rebillId = body.RebillId
    if (typeof body.RebillId === 'number') evt.rebillId = String(body.RebillId)
    if (typeof body.Pan === 'string') {
      const pan = body.Pan
      const digits = pan.replace(/\D/g, '')
      if (digits.length >= 4) evt.cardLast4 = digits.slice(-4)
    }
    if (typeof body.CardType === 'string') evt.cardBrand = body.CardType
    if (typeof body.ExpDate === 'string' && /^\d{4}$/.test(body.ExpDate)) {
      // ExpDate is MMYY
      evt.cardExpMonth = Number(body.ExpDate.slice(0, 2))
      evt.cardExpYear = 2000 + Number(body.ExpDate.slice(2, 4))
    }

    return evt
  }
}
