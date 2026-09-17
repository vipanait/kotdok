import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { connect } from './fixtures'

const APPLE_ISSUER = 'https://appleid.apple.com'

let db: Client

beforeAll(async () => {
  db = await connect()
})

afterAll(async () => {
  await db?.end()
})

/**
 * A token shaped exactly like Apple's — issuer, audience, nonce, a verified
 * address — but signed with a key Apple never saw. Everything about it is
 * right except the one thing that makes it Apple's.
 */
function forgedAppleToken(claims: Record<string, unknown>): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const input = `${encode({ alg: 'ES256', kid: 'not-an-apple-key' })}.${encode(claims)}`
  const signature = sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${input}.${signature.toString('base64url')}`
}

async function countUsers(): Promise<number> {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from auth.users')
  return rows[0].n
}

describe('an Apple identity token that Apple did not sign', () => {
  it('meets a stack that can read Apple’s keys', async () => {
    // Without Apple's keys a forged token is refused too, for the wrong reason.
    // This makes that case fail loudly instead of passing quietly.
    const response = await fetch(`${APPLE_ISSUER}/auth/keys`, { signal: AbortSignal.timeout(10_000) })
    expect(response.ok).toBe(true)
  })

  it('is refused before a session or a user exists', async () => {
    const nonce = randomUUID()
    const email = `forged-${randomUUID()}@example.com`
    const now = Math.floor(Date.now() / 1000)
    const token = forgedAppleToken({
      iss: APPLE_ISSUER,
      aud: 'my.lapka.app',
      sub: `forged.${randomUUID()}`,
      iat: now,
      exp: now + 600,
      email,
      email_verified: 'true',
      nonce: createHash('sha256').update(nonce).digest('hex'),
    })
    const before = await countUsers()

    const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client.auth.signInWithIdToken({ provider: 'apple', token, nonce })

    expect(data.session).toBeNull()
    // Supabase's refusal of the token itself. "…is not enabled" would mean the
    // stack never got as far as looking at the signature.
    expect(error?.message).toBe('Bad ID token')
    expect(await countUsers()).toBe(before)
    const { rows } = await db.query('select 1 from auth.users where email = $1', [email])
    expect(rows).toHaveLength(0)
  })
})
