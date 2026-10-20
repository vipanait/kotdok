import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { FEATURES_HEADER, PET_DATES_FEATURE, PetSchema } from '@lapka/contracts'
import { GET as listPets, POST as createPet } from '@/app/(backend)/api/v1/pets/route'
import { GET as getPet, PATCH as patchPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { GET as getSummary } from '@/app/(backend)/api/v1/pets/[id]/health/summary/route'
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

/** An app that knows the dates says so (FB-2 release); `dates: false` is a store build from before. */
function request(method: string, body?: unknown, { dates = true }: { dates?: boolean } = {}) {
  return new NextRequest('http://test.local/api/v1/pets', {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(dates ? { [FEATURES_HEADER]: PET_DATES_FEATURE } : {}),
    },
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

  it('answers a birth date after the stored home day with 400, not a storage error (FB-2 review)', async () => {
    await patchPet(request('PATCH', { birth_date: null, adopted_on: '2021-01-10' }), params(PET_IDS.aCat))
    const late = await patchPet(request('PATCH', { birth_date: '2025-01-01' }), params(PET_IDS.aCat))
    expect(late.status).toBe(400)
  })

  it('gives an app that does not ask for the dates the pet without them, on every route (FB-2 release)', async () => {
    await patchPet(request('PATCH', { birth_date: '2020-10-20', adopted_on: null }), params(PET_IDS.aCat))
    const older = { dates: false }
    const keys = ['birth_date', 'birth_date_approx', 'adopted_on']

    const one = await (await getPet(request('GET', undefined, older), params(PET_IDS.aCat))).json()
    const list = await (await listPets(request('GET', undefined, older), undefined)).json()
    const health = await (await getHealth(request('GET', undefined, older), params(PET_IDS.aCat))).json()
    const summary = await (await getSummary(request('GET', undefined, older), params(PET_IDS.aCat))).json()
    for (const pet of [one, ...list, health.pet, summary.pet]) {
      for (const key of keys) expect(pet).not.toHaveProperty(key)
    }

    const current = await (await getPet(request('GET'), params(PET_IDS.aCat))).json()
    expect(current).toMatchObject({ birth_date: '2020-10-20' })
  })
})
