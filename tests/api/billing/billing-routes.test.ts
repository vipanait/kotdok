import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { GET as getTransactionRoute } from '@/app/(backend)/api/billing/transactions/[id]/route'
import { GET as listTransactionsRoute } from '@/app/(backend)/api/billing/transactions/route'
import { DELETE as deletePaymentMethodRoute } from '@/app/(backend)/api/billing/payment-methods/[id]/route'
import { GET as listPaymentMethodsRoute } from '@/app/(backend)/api/billing/payment-methods/route'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
import {
  getTransaction,
  listPaymentMethods,
  listTransactions,
  softDeletePaymentMethod,
} from '@/server/billing/billing-queries'

vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/server/billing/billing-queries', () => ({
  getTransaction: vi.fn(),
  listPaymentMethods: vi.fn(),
  listTransactions: vi.fn(),
  softDeletePaymentMethod: vi.fn(),
}))

const user: User = {
  id: 'user-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
}
const serviceClient = { service: true }

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('billing API routes', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(user)
    vi.mocked(createServiceClient).mockReturnValue(serviceClient as never)
    vi.mocked(getTransaction).mockReset()
    vi.mocked(listPaymentMethods).mockReset()
    vi.mocked(listTransactions).mockReset()
    vi.mocked(softDeletePaymentMethod).mockReset()
  })

  it('returns 401 for unauthenticated transaction reads', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await getTransactionRoute(new Request('http://test.local') as never, params('tx-1'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(getTransaction).not.toHaveBeenCalled()
  })

  it('scopes transaction reads by authenticated user id', async () => {
    vi.mocked(getTransaction).mockResolvedValue({
      data: { id: 'tx-1', user_id: user.id },
      error: null,
    } as never)

    const response = await getTransactionRoute(new Request('http://test.local') as never, params('tx-1'))

    expect(response.status).toBe(200)
    expect(getTransaction).toHaveBeenCalledWith(serviceClient, user.id, 'tx-1')
    await expect(response.json()).resolves.toMatchObject({ id: 'tx-1' })
  })

  it('returns 404 when scoped transaction lookup finds no row', async () => {
    vi.mocked(getTransaction).mockResolvedValue({ data: null, error: null } as never)

    const response = await getTransactionRoute(new Request('http://test.local') as never, params('missing-tx'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('returns 401 for unauthenticated transaction list reads', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await listTransactionsRoute()

    expect(response.status).toBe(401)
    expect(listTransactions).not.toHaveBeenCalled()
  })

  it('scopes transaction lists by authenticated user id', async () => {
    vi.mocked(listTransactions).mockResolvedValue({ data: [{ id: 'tx-1' }], error: null } as never)

    const response = await listTransactionsRoute()

    expect(response.status).toBe(200)
    expect(listTransactions).toHaveBeenCalledWith(serviceClient, user.id)
    await expect(response.json()).resolves.toEqual([{ id: 'tx-1' }])
  })

  it('returns 401 for unauthenticated payment method deletion', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await deletePaymentMethodRoute(new Request('http://test.local') as never, params('pm-1'))

    expect(response.status).toBe(401)
    expect(softDeletePaymentMethod).not.toHaveBeenCalled()
  })

  it('scopes payment method deletion by authenticated user id', async () => {
    vi.mocked(softDeletePaymentMethod).mockResolvedValue({ data: { id: 'pm-1' }, error: null } as never)

    const response = await deletePaymentMethodRoute(new Request('http://test.local') as never, params('pm-1'))

    expect(response.status).toBe(204)
    expect(softDeletePaymentMethod).toHaveBeenCalledWith(serviceClient, user.id, 'pm-1')
  })

  it('returns 404 when scoped payment method deletion finds no row', async () => {
    vi.mocked(softDeletePaymentMethod).mockResolvedValue({ data: null, error: null } as never)

    const response = await deletePaymentMethodRoute(new Request('http://test.local') as never, params('missing-pm'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('scopes payment method lists by authenticated user id', async () => {
    vi.mocked(listPaymentMethods).mockResolvedValue({ data: [{ id: 'pm-1' }], error: null } as never)

    const response = await listPaymentMethodsRoute()

    expect(response.status).toBe(200)
    expect(listPaymentMethods).toHaveBeenCalledWith(serviceClient, user.id)
    await expect(response.json()).resolves.toEqual([{ id: 'pm-1' }])
  })
})
