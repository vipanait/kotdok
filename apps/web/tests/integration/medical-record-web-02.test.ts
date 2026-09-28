import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { HealthOverviewSchema, WeightMeasurementSchema } from '@lapka/contracts'
import { newWeightInput, weightCorrection } from '@lapka/shared'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import { DELETE as deleteWeight, PATCH as patchWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/[weightId]/route'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { createServiceClient } from '@/server/supabase/server'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MW-02: the web weight pages against the real database — what the form
// sends is what the contract stores, the record page's lookup keeps other
// owners' measurements out, and a retried save leaves one measurement.

let db: Client
let owners: SeededFixtures
let tokenA: string
let tokenB: string
const pet = PET_IDS.aCat
const TODAY = '2026-09-26'

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(token: string, method: string, body?: unknown) {
  return new NextRequest('http://test.local/api/v1/pets/x/health/weights', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const weightParams = (id: string, weightId: string) => ({ params: Promise.resolve({ id, weightId }) })

async function overview(petId = pet, token = tokenA) {
  return HealthOverviewSchema.parse(await (await getHealth(request(token, 'GET'), params(petId))).json())
}

/** The body the web form sends for what the owner typed. */
function typed(weight: string, day: string) {
  const read = newWeightInput(weight, day, TODAY)
  if (!read.ok) throw new Error(`The form refused ${weight} / ${day}`)
  return read.input
}

beforeAll(async () => {
  db = await connect()
  owners = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_weights where pet_id = any($1)`, [[pet, PET_IDS.aDog, PET_IDS.bCat]])
  await db.query(`update public.pets set weight_kg = null where id = any($1)`, [[pet, PET_IDS.aDog, PET_IDS.bCat]])
})

afterAll(async () => {
  await db?.end()
})

describe('what the form sends is what is stored (MW-02.1)', () => {
  it('stores «4,2» as exactly 4.2 kg, in the history and the pet form', async () => {
    const response = await addWeight(request(tokenA, 'POST', typed('4,2', '2026-09-12')), params(pet))
    expect(response.status).toBe(201)
    const record = await overview()
    expect(record.weights).toEqual([expect.objectContaining({ measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' })])
    expect(record.pet.weight_kg).toBe(4.2)
    const { rows } = await db.query(`select weight_kg::text as kg from public.pet_weights where pet_id = $1`, [pet])
    expect(rows).toEqual([{ kg: '4.2' }])
  })

  it('refuses what the form refuses, and the server refuses it too (MW-02.3)', async () => {
    for (const [weight, day] of [['', TODAY], ['0', TODAY], ['-1', TODAY], ['200,1', TODAY], ['4,2', '2026-09-27']]) {
      expect(newWeightInput(weight, day, TODAY).ok, `${weight} ${day}`).toBe(false)
    }
    // Sent anyway, the contract refuses the same values.
    for (const body of [{ measured_on: TODAY, weight_kg: 0 }, { measured_on: TODAY, weight_kg: -1 }, { measured_on: TODAY, weight_kg: 200.1 }, { measured_on: '2099-01-01', weight_kg: 4 }]) {
      expect((await addWeight(request(tokenA, 'POST', body), params(pet))).status, JSON.stringify(body)).toBe(400)
    }
    expect((await overview()).weights).toEqual([])
  })

  it('leaves one measurement when the same save is sent twice (a retry after a lost answer)', async () => {
    const body = typed('4,2', '2026-09-12')
    expect((await addWeight(request(tokenA, 'POST', body), params(pet))).status).toBe(201)
    expect((await addWeight(request(tokenA, 'POST', body), params(pet))).status).toBe(201)
    expect((await overview()).weights).toHaveLength(1)
  })

  it('corrects and deletes the latest one, and the head follows (MW-02.2)', async () => {
    await addWeight(request(tokenA, 'POST', typed('4,5', '2026-03-12')), params(pet))
    const latest = WeightMeasurementSchema.parse(await (await addWeight(request(tokenA, 'POST', typed('4,2', '2026-09-12')), params(pet))).json())

    const correction = weightCorrection(latest, '4,3', '2026-09-12', TODAY)
    expect(correction).toEqual({ ok: true, patch: { weight_kg: 4.3 } })
    if (!correction.ok || !correction.patch) throw new Error('no patch')
    expect((await patchWeight(request(tokenA, 'PATCH', correction.patch), weightParams(pet, latest.id))).status).toBe(200)
    expect((await overview()).pet.weight_kg).toBe(4.3)

    expect((await deleteWeight(request(tokenA, 'DELETE'), weightParams(pet, latest.id))).status).toBe(204)
    const after = await overview()
    expect(after.pet.weight_kg).toBe(4.5)
    expect(after.weights.map((weight) => weight.measured_on)).toEqual(['2026-03-12'])
    // Deleted twice — the answer to the first was lost: the second finds nothing, which the form counts as done.
    expect((await deleteWeight(request(tokenA, 'DELETE'), weightParams(pet, latest.id))).status).toBe(404)
  })
})

describe('the record pages’ lookup (/pets/[id]/health/[recordId])', () => {
  it('finds the owner’s own measurement under its own pet', async () => {
    const mine = WeightMeasurementSchema.parse(await (await addWeight(request(tokenA, 'POST', typed('4,2', '2026-09-12')), params(pet))).json())
    expect(await findHealthRecord(createServiceClient(), owners.ownerAId, pet, mine.id)).toEqual({ kind: 'weight', status: null })
  })

  it('finds nothing for another owner, another pet, a deleted measurement or a section name', async () => {
    const service = createServiceClient()
    const mine = WeightMeasurementSchema.parse(await (await addWeight(request(tokenA, 'POST', typed('4,2', '2026-09-12')), params(pet))).json())

    // Owner B, with owner A's pet and measurement ids in the address.
    expect(await findHealthRecord(service, owners.ownerBId, pet, mine.id)).toBeNull()
    // Owner B's own pet with owner A's measurement id.
    expect(await findHealthRecord(service, owners.ownerBId, PET_IDS.bCat, mine.id)).toBeNull()
    // Owner A's other pet.
    expect(await findHealthRecord(service, owners.ownerAId, PET_IDS.aDog, mine.id)).toBeNull()
    // Not a UUID: a section's name never reads as a record.
    expect(await findHealthRecord(service, owners.ownerAId, pet, 'weight')).toBeNull()

    await deleteWeight(request(tokenA, 'DELETE'), weightParams(pet, mine.id))
    expect(await findHealthRecord(service, owners.ownerAId, pet, mine.id)).toBeNull()
  })

  it('keeps owner B out through the API as well: no read, no write (MW-02 access)', async () => {
    const mine = WeightMeasurementSchema.parse(await (await addWeight(request(tokenA, 'POST', typed('4,2', '2026-09-12')), params(pet))).json())
    expect((await getHealth(request(tokenB, 'GET'), params(pet))).status).toBe(404)
    expect((await addWeight(request(tokenB, 'POST', typed('9', '2026-09-12')), params(pet))).status).toBe(404)
    expect((await patchWeight(request(tokenB, 'PATCH', { weight_kg: 9 }), weightParams(pet, mine.id))).status).toBe(404)
    expect((await deleteWeight(request(tokenB, 'DELETE'), weightParams(pet, mine.id))).status).toBe(404)
    // Owner A's measurement under owner B's own pet is not reachable either.
    expect((await patchWeight(request(tokenB, 'PATCH', { weight_kg: 9 }), weightParams(PET_IDS.bCat, mine.id))).status).toBe(404)
    const record = await overview()
    expect(record.weights).toEqual([expect.objectContaining({ id: mine.id, weight_kg: 4.2 })])
    expect(record.pet.weight_kg).toBe(4.2)
  })
})
