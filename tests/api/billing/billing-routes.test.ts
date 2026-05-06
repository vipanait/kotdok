import { describe, expect, it } from 'vitest'
import { GET as getTransactionRoute } from '@/app/(backend)/api/billing/transactions/[id]/route'
import { GET as listTransactionsRoute } from '@/app/(backend)/api/billing/transactions/route'
import { DELETE as deletePaymentMethodRoute } from '@/app/(backend)/api/billing/payment-methods/[id]/route'
import { GET as listPaymentMethodsRoute } from '@/app/(backend)/api/billing/payment-methods/route'

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('billing API routes', () => {
  it('returns disabled response for transaction reads', async () => {
    const response = await getTransactionRoute(new Request('http://test.local') as never, params('tx-1'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'billing_disabled',
      message: 'Billing is temporarily disabled.',
    })
  })

  it('returns disabled response for transaction list reads', async () => {
    const response = await listTransactionsRoute()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'billing_disabled',
      message: 'Billing is temporarily disabled.',
    })
  })

  it('returns disabled response for payment method deletion', async () => {
    const response = await deletePaymentMethodRoute(new Request('http://test.local') as never, params('pm-1'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'billing_disabled',
      message: 'Billing is temporarily disabled.',
    })
  })

  it('returns disabled response for payment method list reads', async () => {
    const response = await listPaymentMethodsRoute()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'billing_disabled',
      message: 'Billing is temporarily disabled.',
    })
  })
})
