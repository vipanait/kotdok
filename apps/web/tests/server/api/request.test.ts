import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiErrorEnvelopeSchema } from '@lapka/contracts'
import { readJson, readUuidParam } from '@/server/api/request'
import type { ApiContext } from '@/server/api/with-api-auth'

const context: ApiContext = {
  requestId: 'req-1',
  account: {
    userId: '11111111-1111-4111-8111-000000000001',
    status: 'active',
    role: 'user',
    locale: 'ru',
    credits: 3,
    pdConsentRequired: false,
  },
}

const Schema = z.object({ name: z.string() }).strict()

function post(body: string) {
  return new NextRequest('http://test.local/api/v1/pets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

async function envelope(response: Response) {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error
}

describe('readJson', () => {
  it('returns the parsed body when it matches the schema', async () => {
    const result = await readJson(post('{"name":"Murka"}'), Schema, context)

    expect(result).toEqual({ ok: true, data: { name: 'Murka' } })
  })

  it('answers a body that is not JSON with the usual 400', async () => {
    const result = await readJson(post('{not json'), Schema, context)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect(result.response.headers.get('x-request-id')).toBe('req-1')
    expect(await envelope(result.response)).toMatchObject({ code: 'bad_request', message: 'Body is not valid JSON' })
  })

  it('answers a body outside the contract with the usual 400', async () => {
    const result = await readJson(post('{"name":"Murka","user_id":"x"}'), Schema, context)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect(await envelope(result.response)).toMatchObject({ code: 'bad_request', message: 'Body does not match the contract' })
  })
})

describe('readUuidParam', () => {
  it('refuses nothing for a UUID', () => {
    expect(readUuidParam('11111111-1111-4111-8111-000000000001', context)).toBeNull()
  })

  it('answers anything else like a missing resource', async () => {
    const refused = readUuidParam('not-a-uuid', context)

    expect(refused).not.toBeNull()
    expect(refused!.status).toBe(404)
    expect(refused!.headers.get('x-request-id')).toBe('req-1')
    expect(await envelope(refused!)).toMatchObject({ code: 'not_found', message: 'No such resource' })
  })
})
