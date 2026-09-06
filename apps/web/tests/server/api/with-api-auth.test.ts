import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiErrorEnvelopeSchema } from '@lapka/contracts'
import { readBearerToken } from '@/server/api/bearer-auth'
import { requireAdmin } from '@/server/api/with-api-auth'
import { apiError, apiSuccess } from '@/server/api/response'
import type { AccountContext } from '@/server/auth/account-state'

function request(headers: Record<string, string>) {
  return new NextRequest('http://test.local/api/v1/me', { headers })
}

const account: AccountContext = {
  userId: '11111111-1111-4111-8111-000000000001',
  status: 'active',
  role: 'user',
  locale: 'ru',
  credits: 3,
}

describe('reading the bearer token', () => {
  it('accepts the scheme in any case', () => {
    expect(readBearerToken(request({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi')
    expect(readBearerToken(request({ authorization: 'bearer abc.def.ghi' }))).toBe('abc.def.ghi')
  })

  it.each([
    ['no header', {}],
    ['another scheme', { authorization: 'Basic abc' }],
    ['no token', { authorization: 'Bearer' }],
    ['an empty token', { authorization: 'Bearer ' }],
    ['two tokens', { authorization: 'Bearer a b' }],
    ['a cookie instead', { cookie: 'sb-access-token=abc.def.ghi' }],
  ])('reads nothing from %s', (_name, headers) => {
    expect(readBearerToken(request(headers))).toBeNull()
  })
})

describe('admin gate', () => {
  it('lets an admin through', () => {
    expect(requireAdmin({ requestId: 'r', account: { ...account, role: 'admin' } })).toBeNull()
  })

  it('refuses a regular user with a forbidden code', async () => {
    const response = requireAdmin({ requestId: 'r', account })

    expect(response).not.toBeNull()
    expect(response!.status).toBe(403)
    const envelope = ApiErrorEnvelopeSchema.parse(await response!.json())
    expect(envelope.error.code).toBe('forbidden')
  })
})

describe('response envelope', () => {
  it('marks success private and carries the request id', async () => {
    const response = apiSuccess('req-1', { ok: true })

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-request-id')).toBe('req-1')
  })

  it('shapes errors the way the contract says, with the matching status', async () => {
    const response = apiError('req-2', 'insufficient_credits', 'no checks left')

    expect(response.status).toBe(402)
    const envelope = ApiErrorEnvelopeSchema.parse(await response.json())
    expect(envelope.error).toEqual({
      code: 'insufficient_credits',
      message: 'no checks left',
      request_id: 'req-2',
    })
    // Errors can differ per user, so they must not be cached either.
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
