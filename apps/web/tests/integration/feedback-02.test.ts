import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { PetSchema } from '@lapka/contracts'
import { POST as createPet } from '@/app/(backend)/api/v1/pets/route'
import { GET as getPet, PATCH as patchPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

/**
 * FB-2/01: a pet's birth date (exact or approximate) and the day it came
 * home, written and read through the v1 API against the local stack.
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

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  token = await signIn(OWNER_A.email)
})

afterAll(async () => {
  await db?.end()
})

describe('pet dates (FB-2/01)', () => {
  it('keeps the birth date, its approximation and the home day it was created with', async () => {
    const created = await createPet(
      request('POST', {
        species: 'cat',
        name: 'Мурка',
        age_years: 4.5,
        birth_date: '2022-04-20',
        birth_date_approx: true,
        adopted_on: '2022-06-01',
      }),
      undefined,
    )
    expect(created.status).toBe(201)
    const pet = PetSchema.parse(await created.json())

    expect(await read(pet.id)).toMatchObject({
      birth_date: '2022-04-20',
      birth_date_approx: true,
      adopted_on: '2022-06-01',
    })
  })

  it('reads a pet saved before the dates as having none', async () => {
    expect(await read(PET_IDS.aCat)).toMatchObject({ birth_date: null, birth_date_approx: false, adopted_on: null })
  })

  it('refuses a birth date or a home day in the future', async () => {
    const birth = await createPet(request('POST', { species: 'cat', name: 'Мурка', birth_date: '2999-01-01' }), undefined)
    expect(birth.status).toBe(400)
    const home = await patchPet(request('PATCH', { adopted_on: '2999-01-01' }), params(PET_IDS.aCat))
    expect(home.status).toBe(400)
  })

  it('leaves the dates alone when the site sends its form back with the same age', async () => {
    await patchPet(
      request('PATCH', { birth_date: '2020-10-20', birth_date_approx: false, adopted_on: '2021-01-10', age_years: 6 }),
      params(PET_IDS.aCat),
    )

    // The site's form knows no dates: it sends everything else, age included.
    const site = await patchPet(request('PATCH', { name: 'Мурка', age_years: 6 }), params(PET_IDS.aCat))
    expect(site.status).toBe(200)
    expect(await read(PET_IDS.aCat)).toMatchObject({ birth_date: '2020-10-20', adopted_on: '2021-01-10' })
  })

  it('drops the birth date when the age is changed without it, and keeps the home day', async () => {
    await patchPet(
      request('PATCH', { birth_date: '2020-10-20', birth_date_approx: false, adopted_on: '2021-01-10', age_years: 6 }),
      params(PET_IDS.aCat),
    )

    const changed = await patchPet(request('PATCH', { age_years: 8 }), params(PET_IDS.aCat))
    expect(changed.status).toBe(200)
    expect(await read(PET_IDS.aCat)).toMatchObject({
      age_years: 8,
      birth_date: null,
      birth_date_approx: false,
      adopted_on: '2021-01-10',
    })
  })

  it('takes a new age together with a new birth date', async () => {
    const both = await patchPet(
      request('PATCH', { birth_date: '2019-10-20', birth_date_approx: true, age_years: 7 }),
      params(PET_IDS.aCat),
    )
    expect(both.status).toBe(200)
    expect(await read(PET_IDS.aCat)).toMatchObject({ age_years: 7, birth_date: '2019-10-20', birth_date_approx: true })
  })
})
