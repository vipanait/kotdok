import { afterEach, describe, expect, it, vi } from 'vitest'
import { DummyProvider } from '../dummy'

const payload = {
  providerPaymentId: 'dummy_payment_1',
  status: 'succeeded' as const,
  rebillId: 'rebill_1',
  cardLast4: '4242',
  cardBrand: 'Visa',
  cardExpMonth: 12,
  cardExpYear: 2030,
}

describe('DummyProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates relative checkout redirects and cryptographically-shaped provider ids', async () => {
    const provider = new DummyProvider()
    const result = await provider.initPayment({
      transactionId: 'tx_123',
      userId: 'user_123',
      amountCents: 1000,
      currency: 'RUB',
      description: 'test',
      returnUrl: 'https://example.test/return/tx_123',
      savePaymentMethod: true,
    })

    expect(result.redirectUrl).toBe('/billing/dummy/tx_123?save=1')
    expect(result.providerPaymentId).toMatch(/^dummy_[0-9a-f-]{36}$/)
  })

  it('requires the configured webhook secret', async () => {
    vi.stubEnv('DUMMY_WEBHOOK_SECRET', 'expected-secret')
    const provider = new DummyProvider()
    const headers = new Headers({ 'x-dummy-webhook-secret': 'wrong-secret' })

    await expect(provider.parseWebhook(JSON.stringify(payload), headers))
      .rejects
      .toThrow('invalid_signature')
  })

  it('allows unsigned webhooks only from local requests outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DUMMY_WEBHOOK_SECRET', '')
    const provider = new DummyProvider()
    const event = await provider.parseWebhook(
      JSON.stringify(payload),
      new Headers({ host: 'localhost:3000' }),
    )

    expect(event).toMatchObject({
      providerPaymentId: payload.providerPaymentId,
      providerEventId: 'dummy:dummy_payment_1:succeeded',
      status: 'succeeded',
      rebillId: payload.rebillId,
      cardLast4: payload.cardLast4,
    })
  })

  it('rejects unsigned shared-environment webhooks', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DUMMY_WEBHOOK_SECRET', '')
    const provider = new DummyProvider()

    await expect(provider.parseWebhook(
      JSON.stringify(payload),
      new Headers({ host: 'preview.example.test' }),
    )).rejects.toThrow('dummy_webhook_secret_required')
  })

  it('rejects malformed webhook payloads', async () => {
    vi.stubEnv('DUMMY_WEBHOOK_SECRET', 'expected-secret')
    const provider = new DummyProvider()
    const headers = new Headers({ 'x-dummy-webhook-secret': 'expected-secret' })

    await expect(provider.parseWebhook('{bad-json', headers)).rejects.toThrow('invalid_json')
    await expect(provider.parseWebhook('{}', headers)).rejects.toThrow('missing_fields')
  })
})
