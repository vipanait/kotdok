import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, HealthOverviewSchema, PetSchema, WeightMeasurementSchema } from '@lapka/contracts'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import {
  DELETE as deleteWeight,
  PATCH as patchWeight,
} from '@/app/(backend)/api/v1/pets/[id]/health/weights/[weightId]/route'
import { PATCH as patchPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures } from './fixtures'

// MR-02: weight history against the real database — the SQL functions, the
// unique index and the sync to the pet form are what is under test here.

let db: Client
let tokenA: string
let tokenB: string
const pet: string = PET_IDS.aCat

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

async function add(measured_on: string, weight_kg: unknown, token = tokenA, petId = pet) {
  return addWeight(request(token, 'POST', { measured_on, weight_kg }), params(petId))
}

async function overview() {
  const response = await getHealth(request(tokenA, 'GET'), params(pet))
  return HealthOverviewSchema.parse(await response.json())
}

async function formWeight(): Promise<number | null> {
  const { rows } = await db.query(`select weight_kg from public.pets where id = $1`, [pet])
  return rows[0].weight_kg === null ? null : Number(rows[0].weight_kg)
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_weights where pet_id = $1`, [pet])
  await db.query(`update public.pets set weight_kg = null where id = $1`, [pet])
})

afterAll(async () => {
  await db?.end()
})

describe('adding a weight', () => {
  it('stores it, lists it and makes it the form’s weight', async () => {
    const response = await add('2026-09-12', 4.2)
    expect(response.status).toBe(201)
    const created = WeightMeasurementSchema.parse(await response.json())
    expect(created).toMatchObject({ measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' })

    const record = await overview()
    expect(record.writable).toContain('weight')
    expect(record.weights.map((w) => w.id)).toEqual([created.id])
    expect(record.pet.weight_kg).toBe(4.2)
    expect(await formWeight()).toBe(4.2)
  })

  it('refuses zero, a negative weight, over 200 and a non-number (MR-02.1)', async () => {
    for (const weight of [0, -3, 200.5, '4,2']) {
      const response = await add('2026-09-12', weight)
      expect(response.status, String(weight)).toBe(400)
    }
    expect((await overview()).weights).toEqual([])
  })

  it('refuses a day in the future', async () => {
    const response = await add('2999-01-01', 4.2)
    expect(response.status).toBe(400)
  })

  it('does not let an older day change the current weight (MR-02.2)', async () => {
    await add('2026-09-12', 4.2)
    await add('2026-03-12', 4.5)
    expect(await formWeight()).toBe(4.2)
    expect((await overview()).weights.map((w) => w.measured_on)).toEqual(['2026-09-12', '2026-03-12'])
  })

  it('updates the day’s value on a second save instead of adding a row', async () => {
    await add('2026-09-12', 4.2)
    const again = await add('2026-09-12', 4.3)
    expect(again.status).toBe(201)
    const { weights } = await overview()
    expect(weights).toHaveLength(1)
    expect(weights[0].weight_kg).toBe(4.3)
  })

  it('keeps one row when two saves for the same day race (MR-02.3)', async () => {
    const results = await Promise.all([add('2026-09-20', 4.1), add('2026-09-20', 4.1), add('2026-09-20', 4.1)])
    expect(results.map((r) => r.status)).toEqual([201, 201, 201])
    const { rows } = await db.query(
      `select count(*)::int as n from public.pet_weights where pet_id = $1 and measured_on = '2026-09-20' and deleted_at is null`,
      [pet],
    )
    expect(rows[0].n).toBe(1)
  })

  it('keeps the form’s old undated weight in the history when the first dated one arrives', async () => {
    await db.query(`update public.pets set weight_kg = 28 where id = $1`, [pet])

    await add('2026-09-24', 27.5)

    const { weights, pet: form } = await overview()
    expect(form.weight_kg).toBe(27.5)
    expect(weights.map((w) => [w.measured_on, w.weight_kg, w.source])).toEqual([
      ['2026-09-24', 27.5, 'record'],
      [null, 28, 'form'],
    ])
  })

  it('answers 404 for someone else’s pet and for a deleted one', async () => {
    expect((await add('2026-09-12', 4.2, tokenB, pet)).status).toBe(404)
    expect((await add('2026-09-12', 4.2, tokenB, PET_IDS.bDeleted)).status).toBe(404)
    expect((await overview()).weights).toEqual([])
  })
})

describe('correcting and deleting', () => {
  it('recalculates the form’s weight when the latest one is corrected or removed (MR-02.2)', async () => {
    await add('2026-03-12', 4.5)
    const latest = WeightMeasurementSchema.parse(await (await add('2026-09-12', 4.2)).json())

    const fixed = await patchWeight(request(tokenA, 'PATCH', { weight_kg: 4.1 }), weightParams(pet, latest.id))
    expect(fixed.status).toBe(200)
    expect(await formWeight()).toBe(4.1)

    const moved = await patchWeight(request(tokenA, 'PATCH', { measured_on: '2026-01-01' }), weightParams(pet, latest.id))
    expect(moved.status).toBe(200)
    expect(await formWeight()).toBe(4.5)

    const march = (await overview()).weights.find((w) => w.measured_on === '2026-03-12')!
    expect((await deleteWeight(request(tokenA, 'DELETE'), weightParams(pet, march.id))).status).toBe(204)
    expect(await formWeight()).toBe(4.1)
  })

  it('leaves the form’s weight unknown, not zero, when the last measurement goes', async () => {
    const only = WeightMeasurementSchema.parse(await (await add('2026-09-12', 4.2)).json())
    await deleteWeight(request(tokenA, 'DELETE'), weightParams(pet, only.id))
    expect(await formWeight()).toBeNull()
    expect((await overview()).pet.weight_kg).toBeNull()
  })

  it('refuses to move a measurement onto a day that already has one', async () => {
    await add('2026-03-12', 4.5)
    const other = WeightMeasurementSchema.parse(await (await add('2026-09-12', 4.2)).json())
    const response = await patchWeight(request(tokenA, 'PATCH', { measured_on: '2026-03-12' }), weightParams(pet, other.id))
    expect(response.status).toBe(409)
    expect(ApiErrorEnvelopeSchema.parse(await response.json()).error.code).toBe('conflict')
  })

  it('does not let another owner touch a measurement', async () => {
    const mine = WeightMeasurementSchema.parse(await (await add('2026-09-12', 4.2)).json())
    expect((await patchWeight(request(tokenB, 'PATCH', { weight_kg: 1 }), weightParams(pet, mine.id))).status).toBe(404)
    expect((await deleteWeight(request(tokenB, 'DELETE'), weightParams(pet, mine.id))).status).toBe(404)
    expect(await formWeight()).toBe(4.2)
  })
})

describe('row level security', () => {
  function asUser(token: string) {
    return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
  }

  it('lets the owner read their pet’s weights with their own token, and nobody else', async () => {
    await add('2026-09-12', 4.2)

    const own = await asUser(tokenA).from('pet_weights').select('weight_kg').eq('pet_id', pet)
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ weight_kg: 4.2 }])

    const other = await asUser(tokenB).from('pet_weights').select('weight_kg').eq('pet_id', pet)
    expect(other.data).toEqual([])
  })

  it('refuses a direct write with a user token', async () => {
    const insert = await asUser(tokenA)
      .from('pet_weights')
      .insert({ user_id: (await db.query(`select user_id from public.pets where id = $1`, [pet])).rows[0].user_id, pet_id: pet, measured_on: '2026-09-01', weight_kg: 9 })
    expect(insert.error).not.toBeNull()
    expect((await overview()).weights).toEqual([])
  })
})

describe('the pet form', () => {
  it('records a changed weight as that day’s measurement, and nothing when it did not change', async () => {
    const first = await patchPet(
      request(tokenA, 'PATCH', { weight_kg: 4.4, weight_measured_on: '2026-09-25' }),
      params(pet),
    )
    expect(first.status).toBe(200)
    expect(PetSchema.parse(await first.json()).weight_kg).toBe(4.4)

    await patchPet(request(tokenA, 'PATCH', { name: 'Мурка', weight_kg: 4.4, weight_measured_on: '2026-09-26' }), params(pet))

    const { weights } = await overview()
    expect(weights.map((w) => [w.measured_on, w.weight_kg, w.source])).toEqual([['2026-09-25', 4.4, 'form']])
  })
})
