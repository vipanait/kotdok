import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, HealthOverviewSchema } from '@lapka/contracts'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MR-01.2: the medical record answers only its owner, only for a live pet,
// only while the account is active. Real database, real RLS-free service
// client — the same path the route takes in production.

let db: Client
let seeded: SeededFixtures
let tokenA: string
let tokenB: string

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(token: string, petId: string) {
  return new NextRequest(`http://test.local/api/v1/pets/${petId}/health`, {
    headers: { authorization: `Bearer ${token}` },
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

afterAll(async () => {
  await db?.end()
})

describe('GET /api/v1/pets/{id}/health', () => {
  it('returns the owner’s pet form unchanged, with nothing writable yet', async () => {
    const response = await getHealth(request(tokenA, PET_IDS.aDog), params(PET_IDS.aDog))
    expect(response.status).toBe(200)

    const overview = HealthOverviewSchema.parse(await response.json())
    const { rows } = await db.query(`select name, weight_kg, vaccinated from public.pets where id = $1`, [PET_IDS.aDog])
    expect(overview.pet.id).toBe(PET_IDS.aDog)
    expect(overview.pet.name).toBe(rows[0].name)
    expect(overview.pet.weight_kg).toBe(rows[0].weight_kg === null ? null : Number(rows[0].weight_kg))
    expect(overview.pet.vaccinated).toBe(rows[0].vaccinated)
    expect(overview.writable).toEqual([])
  })

  it('answers 404 for someone else’s pet', async () => {
    const response = await getHealth(request(tokenB, PET_IDS.aCat), params(PET_IDS.aCat))
    expect(response.status).toBe(404)
    expect(ApiErrorEnvelopeSchema.parse(await response.json()).error.code).toBe('not_found')
  })

  it('answers 404 for a soft-deleted pet, even to its owner', async () => {
    const response = await getHealth(request(tokenB, PET_IDS.bDeleted), params(PET_IDS.bDeleted))
    expect(response.status).toBe(404)
  })

  it('answers 404 for an id that is not a uuid', async () => {
    const response = await getHealth(request(tokenA, 'nope'), params('nope'))
    expect(response.status).toBe(404)
  })

  it('returns nothing about the pet while the account is being deleted', async () => {
    await db.query(`update public.profiles set status = 'deleting' where id = $1`, [seeded.ownerAId])
    try {
      const response = await getHealth(request(tokenA, PET_IDS.aCat), params(PET_IDS.aCat))
      expect(response.status).not.toBe(200)
      const body = await response.json()
      expect(body.pet).toBeUndefined()
      expect(ApiErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    } finally {
      await db.query(`update public.profiles set status = 'active' where id = $1`, [seeded.ownerAId])
    }
  })
})
