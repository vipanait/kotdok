import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { HealthEventSchema, PetSchema } from '@lapka/contracts'
import { GET as getPet, PATCH as patchPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { DELETE as deleteEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

// The pet form against the record, across stages: what the owner said stays theirs,
// and a form opened earlier changes only what the owner changed in it.

let db: Client
let token: string
const cat: string = PET_IDS.aCat

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

async function pet() {
  return PetSchema.parse(await (await getPet(request(), params(cat))).json())
}

/** The form as the app sends it: everything it loaded, with the owner's edits. */
function form(loaded: Awaited<ReturnType<typeof pet>>, edits: Record<string, unknown> = {}) {
  const { id: _id, created_at: _created, ...fields } = loaded as Record<string, unknown>
  void _id
  void _created
  return { ...fields, weight_measured_on: day(0), ...edits }
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  token = await signIn(OWNER_A.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_medications where pet_id = $1`, [cat])
  await db.query(`delete from public.pet_health_events where pet_id = $1`, [cat])
  await db.query(`delete from public.pet_weights where pet_id = $1`, [cat])
  await db.query(`update public.pets set vaccinated = false, vaccinated_form = false, medications = '{}', weight_kg = 4.2 where id = $1`, [cat])
})

afterAll(async () => {
  await db?.end()
})

describe('the pet form next to the medical record', () => {
  it('keeps the owner’s «not vaccinated» when the form is saved while a record says vaccinated', async () => {
    const created = await createEvent(
      request('POST', { kind: 'vaccination', status: 'done', date: day(-2), items: [{ name: null, targets: ['rabies'] }] }),
      params(cat),
    )
    const event = HealthEventSchema.parse(await created.json())
    const loaded = await pet()
    expect(loaded.vaccinated).toBe(true)

    // The owner renames the pet; the form sends back the «vaccinated» it showed.
    expect((await patchPet(request('PATCH', form(loaded, { name: 'Мурка-2' })), params(cat))).status).toBe(200)
    // The vaccination was a mistake.
    expect((await deleteEvent(request('DELETE'), { params: Promise.resolve({ id: cat, eventId: event.id }) })).status).toBe(204)

    expect((await pet()).vaccinated).toBe(false)
  })

  it('does not end a course added in the record after the form was opened', async () => {
    // «Корм» through the form, as an owner would: it becomes a course.
    expect((await patchPet(request('PATCH', form(await pet(), { medications: ['Корм'] })), params(cat))).status).toBe(200)
    const loaded = await pet()
    expect(loaded.medications).toEqual(['Корм'])
    await addMedications(request('POST', { items: [{ name: 'Витамины', started_on: day(-1) }] }), params(cat))

    const saved = await patchPet(
      request('PATCH', form(loaded, { name: 'Мурка', medications_before: loaded.medications })),
      params(cat),
    )
    expect(saved.status).toBe(200)

    const { medications } = await (await getHealth(request(), params(cat))).json()
    const vitamins = medications.find((course: { name: string }) => course.name === 'Витамины')
    expect(vitamins.ended_on).toBeNull()
    expect((await pet()).medications.sort()).toEqual(['Витамины', 'Корм'])
  })

  it('does not record the weight the form showed as a new one when a newer measurement came in', async () => {
    const loaded = await pet()
    await addWeight(request('POST', { measured_on: day(0), weight_kg: 4.0 }), params(cat))

    expect((await patchPet(request('PATCH', form(loaded, { name: 'Мурка', weight_kg_before: loaded.weight_kg })), params(cat))).status).toBe(200)

    expect((await pet()).weight_kg).toBe(4.0)
  })

  it('still records a weight the owner changed in the form', async () => {
    const loaded = await pet()
    expect((await patchPet(request('PATCH', form(loaded, { weight_kg: 4.6, weight_kg_before: loaded.weight_kg })), params(cat))).status).toBe(200)
    expect((await pet()).weight_kg).toBe(4.6)
  })
})
