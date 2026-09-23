import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, UploadGrantSchema } from '@lapka/contracts'
import { POST as requestUploads } from '@/app/(backend)/api/v1/uploads/route'
import { FIXTURE_PASSWORD, OWNER_A, connect, resetFixtures, seedFixtures } from './fixtures'

let db: Client
let token: string

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function post(body: unknown) {
  return new NextRequest('http://test.local/api/v1/uploads', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  await seedFixtures(db)
  await db.query('truncate table public.photo_uploads, public.api_rate_limits')
  token = await signIn(OWNER_A.email)
})

afterAll(async () => {
  await db?.end()
})

describe('POST /api/v1/uploads', () => {
  it('answers 201 with one grant per file, in the contract’s shape', async () => {
    const response = await requestUploads(
      post({ files: [{ content_type: 'image/jpeg', size_bytes: 400_000 }] }),
      undefined,
    )
    expect(response.status).toBe(201)
    expect(UploadGrantSchema.parse(await response.json()).uploads).toHaveLength(1)
  })

  it('refuses a fourth file with 400 and hands out nothing', async () => {
    const file = { content_type: 'image/jpeg', size_bytes: 1 }
    const response = await requestUploads(post({ files: [file, file, file, file] }), undefined)
    expect(response.status).toBe(400)
    expect(ApiErrorEnvelopeSchema.parse(await response.json()).error.code).toBe('bad_request')
    const { rows } = await db.query('select count(*)::int as n from public.photo_uploads')
    expect(rows[0].n).toBe(0)
  })

  it('refuses a caller without a session', async () => {
    const response = await requestUploads(
      new NextRequest('http://test.local/api/v1/uploads', { method: 'POST', body: '{}' }),
      undefined,
    )
    expect(response.status).toBe(401)
  })
})
