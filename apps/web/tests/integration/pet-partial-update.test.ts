import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { PetSchema } from '@lapka/contracts'
import { GET as getPet, PATCH as patchPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

/**
 * PATCH /api/v1/pets/:id is a partial update, as the contract says: a field
 * the body leaves out keeps its stored value. Both clients send the whole
 * form today; a body with one field must not reset the rest.
 */

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

function request(method: string, body?: unknown) {
  return new NextRequest('http://test.local/api/v1/pets', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function read(id: string) {
  return PetSchema.parse(await (await getPet(request('GET'), params(id))).json())
}

async function patch(id: string, body: unknown) {
  const response = await patchPet(request('PATCH', body), params(id))
  expect(response.status).toBe(200)
  return PetSchema.parse(await response.json())
}

/** The dog as the whole form leaves it: every field the partial updates must keep. */
const FULL_DOG = {
  species: 'dog',
  name: 'Рекс',
  breed: 'labrador',
  age_years: 3,
  sex: 'male',
  neutered: false,
  indoor_outdoor: 'both',
  diet: 'dry',
  size_class: 'large',
  walk_activity: 'daily_long',
  allergies: ['курица'],
  vaccinated: true,
  chronic_conditions: ['дисплазия'],
  medications: ['Мелоксикам'],
  notes: 'Боится пылесоса',
} as const

const KEPT = {
  species: 'dog',
  breed: 'labrador',
  age_years: 3,
  weight_kg: 28,
  sex: 'male',
  neutered: false,
  indoor_outdoor: 'both',
  diet: 'dry',
  size_class: 'large',
  walk_activity: 'daily_long',
  allergies: ['курица'],
  chronic_conditions: ['дисплазия'],
  medications: ['Мелоксикам'],
  notes: 'Боится пылесоса',
}

async function stored(id: string) {
  const { rows } = await db.query<{ vaccinated_form: boolean | null; weights: number; courses: number }>(
    `select p.vaccinated_form,
            (select count(*)::int from public.pet_weights w where w.pet_id = p.id and w.deleted_at is null) as weights,
            (select count(*)::int from public.pet_medications m where m.pet_id = p.id and m.deleted_at is null and m.ended_on is null) as courses
       from public.pets p where p.id = $1`,
    [id],
  )
  return rows[0]
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await seedFixtures(db)
  token = await signIn(OWNER_A.email)
  // The whole form, without the weight: the fixture's 28 kg stays undated, with no history.
  await patch(PET_IDS.aDog, FULL_DOG)
})

afterAll(async () => {
  await db?.end()
})

describe('PATCH /api/v1/pets/:id is partial', () => {
  it('a new name keeps every other field, the weight and the medicine courses', async () => {
    const before = await stored(PET_IDS.aDog)

    const pet = await patch(PET_IDS.aDog, { name: 'Бобик' })

    expect(pet).toMatchObject({ ...KEPT, name: 'Бобик', vaccinated: true })
    expect(await read(PET_IDS.aDog)).toMatchObject({ ...KEPT, name: 'Бобик', vaccinated: true })
    expect(await stored(PET_IDS.aDog)).toEqual(before)
  })

  it('a vaccination answer keeps the name and everything else', async () => {
    await patch(PET_IDS.aDog, { vaccinated: false })

    const pet = await patch(PET_IDS.aDog, { vaccinated: true })

    expect(pet).toMatchObject({ ...KEPT, name: 'Рекс', vaccinated: true })
    expect((await stored(PET_IDS.aDog)).vaccinated_form).toBe(true)
  })

  it('leaves the owner’s vaccination answer alone when the body does not give one', async () => {
    await patch(PET_IDS.aDog, { notes: 'Любит морковку' })

    expect((await stored(PET_IDS.aDog)).vaccinated_form).toBe(true)
    expect(await read(PET_IDS.aDog)).toMatchObject({ vaccinated: true, notes: 'Любит морковку' })
  })

  it('a dog field without the species is the stored dog’s', async () => {
    const pet = await patch(PET_IDS.aDog, { size_class: 'medium' })

    expect(pet).toMatchObject({ ...KEPT, name: 'Рекс', size_class: 'medium' })
  })

  it('clears a field the body sends as null', async () => {
    const pet = await patch(PET_IDS.aDog, { breed: null, allergies: [] })

    expect(pet).toMatchObject({ ...KEPT, name: 'Рекс', breed: null, allergies: [] })
  })

  it('a medicine list alone starts its course and changes nothing else', async () => {
    const pet = await patch(PET_IDS.aDog, { medications: ['Мелоксикам', 'Омепразол'] })

    expect(pet).toMatchObject({ ...KEPT, name: 'Рекс', vaccinated: true, medications: ['Мелоксикам', 'Омепразол'] })
    expect((await stored(PET_IDS.aDog)).courses).toBe(2)
  })

  it('a weight alone goes into the history and changes nothing else', async () => {
    const pet = await patch(PET_IDS.aDog, { weight_kg: 30, weight_measured_on: '2026-10-01' })

    expect(pet).toMatchObject({ ...KEPT, name: 'Рекс', vaccinated: true, weight_kg: 30 })
    expect((await stored(PET_IDS.aDog)).weights).toBeGreaterThan(0)
  })

  it('a dog turned into a cat loses the dog-only fields', async () => {
    const pet = await patch(PET_IDS.aDog, { species: 'cat' })

    expect(pet).toMatchObject({ species: 'cat', name: 'Рекс', breed: 'labrador', size_class: null, walk_activity: null })
  })
})
