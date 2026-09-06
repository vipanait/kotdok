import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getTransactionRoute } from '@/app/(backend)/api/billing/transactions/[id]/route'
import { GET as listTransactionsRoute } from '@/app/(backend)/api/billing/transactions/route'
import { DELETE as deletePaymentMethodRoute } from '@/app/(backend)/api/billing/payment-methods/[id]/route'
import { GET as listPaymentMethodsRoute } from '@/app/(backend)/api/billing/payment-methods/route'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'

function csrfRequest(method: string) {
  const token = 'test-csrf-token'
  return new NextRequest('http://test.local', {
    method,
    headers: {
      origin: 'http://test.local',
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      [CSRF_HEADER_NAME]: token,
    },
  })
}

describe('billing API routes', () => {
  it('returns disabled response for transaction reads', async () => {
    const response = await getTransactionRoute()

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
    const response = await deletePaymentMethodRoute(csrfRequest('DELETE') as never)

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
