import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { VetSummarySchema } from '@lapka/contracts'
import { GET as getSummary } from '@/app/(backend)/api/v1/pets/[id]/health/summary/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { CHECK_IDS, FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

// MR-09: the summary for the vet, on the real database.

let db: Client
let token: string
const cat: string = PET_IDS.aCat
const dog: string = PET_IDS.aDog

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(method = 'GET', body?: unknown) {
  return new NextRequest('http://test.local/x', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

async function summary(petId: string) {
  const response = await getSummary(request(), params(petId))
  expect(response.status).toBe(200)
  return VetSummarySchema.parse(await response.json())
}

async function created(response: Response) {
  expect(response.status, await response.clone().text()).toBe(201)
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  token = await signIn(OWNER_A.email)
})

beforeEach(async () => {
  for (const pet of [cat, dog]) {
    await db.query(`delete from public.pet_medications where pet_id = $1`, [pet])
    await db.query(`delete from public.pet_health_events where pet_id = $1`, [pet])
    await db.query(`delete from public.pet_weights where pet_id = $1`, [pet])
  }
})

afterAll(async () => {
  await db?.end()
})

describe('the summary for the vet (MR-09.1)', () => {
  it('has every section for a cat with records', async () => {
    await created(
      await createEvent(
        request('POST', {
          kind: 'vaccination',
          status: 'done',
          date: day(-200),
          items: [{ name: 'Нобивак Rabies', targets: ['rabies'], next_on: day(165) }],
        }),
        params(cat),
      ),
    )
    await created(
      await createEvent(
        request('POST', { kind: 'parasite', status: 'done', date: day(-20), items: [{ name: 'Бравекто', targets: ['fleas', 'ticks'] }] }),
        params(cat),
      ),
    )
    await created(
      await createVisit(
        request('POST', {
          status: 'done',
          date: day(-60),
          visit_kind: 'illness',
          diagnosis: 'Гастрит',
          prescriptions: [{ name: 'Фортифлора', instructions: '1 пакетик', add_to_medications: false }],
        }),
        params(cat),
      ),
    )
    await created(await createVisit(request('POST', { status: 'done', date: day(-400), visit_kind: 'checkup' }), params(cat)))
    await created(await createVisit(request('POST', { status: 'planned', date: day(10), visit_kind: 'checkup' }), params(cat)))
    for (const [offset, kg] of [[-300, 4.5], [-200, 4.4], [-100, 4.3], [-50, 4.2], [-20, 4.1], [-5, 4.0]] as const) {
      await created(await addWeight(request('POST', { measured_on: day(offset), weight_kg: kg }), params(cat)))
    }
    await created(
      await addMedications(
        request('POST', {
          items: [
            { name: 'Лечебный корм', dosage: 'Постоянно', started_on: day(-60), ongoing: true },
            { name: 'Смекта', started_on: day(-90), ended_on: day(-80) },
            { name: 'Витамины', started_on: day(5) },
          ],
        }),
        params(cat),
      ),
    )

    const cat_ = await summary(cat)

    expect(cat_.pet.id).toBe(cat)
    expect(cat_.vaccinations.map((row) => row.target)).toEqual(['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies'])
    expect(cat_.vaccinations.find((row) => row.target === 'rabies')).toEqual({
      target: 'rabies',
      core: true,
      last_done: day(-200),
      product: 'Нобивак Rabies',
      next: day(165),
    })
    expect(cat_.vaccinations.find((row) => row.target === 'panleukopenia')).toMatchObject({ last_done: null, product: null, next: null })
    expect(cat_.parasites).toEqual([
      { group: 'fleas_ticks', last_done: day(-20), product: 'Бравекто', next: null },
      { group: 'worms', last_done: null, product: null, next: null },
    ])
    // A year back: the visit 400 days ago and the planned one are left out.
    expect(cat_.visits.map((visit) => [visit.date, visit.diagnosis, visit.items.map((item) => item.name)])).toEqual([
      [day(-60), 'Гастрит', ['Фортифлора']],
    ])
    expect(cat_.weights.map((weight) => weight.weight_kg)).toEqual([4.0, 4.1, 4.2, 4.3, 4.4])
    // Now: not the ended one, not the one that starts later.
    expect(cat_.medications.map((course) => course.name)).toEqual(['Лечебный корм'])
    expect(cat_.checks).toEqual([
      { id: CHECK_IDS.aFirst, created_at: '2026-05-01T10:00:00.000Z', urgency: 'monitor', summary: 'vomiting twice' },
    ])
  })

  it('gives the dog none of the cat’s data, and no made-up absence', async () => {
    await created(
      await createEvent(
        request('POST', { kind: 'vaccination', status: 'done', date: day(-30), items: [{ name: 'Нобивак Rabies', targets: ['rabies'] }] }),
        params(cat),
      ),
    )
    await created(await addWeight(request('POST', { measured_on: day(-3), weight_kg: 4 }), params(cat)))

    const dog_ = await summary(dog)

    expect(dog_.pet.id).toBe(dog)
    expect(dog_.vaccinations.map((row) => row.target)).toEqual(['distemper', 'parvovirus', 'adenovirus', 'rabies'])
    // Nothing recorded is null, not «no»: the apps say «Не указано владельцем».
    expect(dog_.vaccinations.every((row) => row.last_done === null && row.product === null)).toBe(true)
    expect(dog_.weights).toEqual([])
    expect(dog_.visits).toEqual([])
    expect(dog_.medications).toEqual([])
    expect(dog_.checks.map((check) => check.id)).toEqual([CHECK_IDS.aSecond])
  })

  it('lists a non-core disease only once it has a record', async () => {
    await created(
      await createEvent(
        request('POST', { kind: 'vaccination', status: 'planned', date: day(30), items: [{ name: null, targets: ['felv'] }] }),
        params(cat),
      ),
    )
    const cat_ = await summary(cat)
    expect(cat_.vaccinations.at(-1)).toEqual({ target: 'felv', core: false, last_done: null, product: null, next: day(30) })
  })

  it('is not found for another owner’s pet or a deleted one', async () => {
    expect((await getSummary(request(), params(PET_IDS.bCat))).status).toBe(404)
    expect((await getSummary(request(), params(PET_IDS.bDeleted))).status).toBe(404)
    expect((await getSummary(request(), params('not-a-uuid'))).status).toBe(404)
  })
})
