import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { DueItemSchema, HealthEventSchema, HealthOverviewSchema } from '@lapka/contracts'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { PATCH as patchVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/[eventId]/route'
import { DELETE as deleteEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { POST as toMedication } from '@/app/(backend)/api/v1/pets/[id]/health/items/[itemId]/medication/route'
import { PATCH as patchMedication } from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/route'
import { GET as listDue } from '@/app/(backend)/api/v1/pets/due/route'
import { CHECK_IDS, FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

// MR-07: vet visits, prescriptions and the courses they start, on the real database.

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
const eventParams = (eventId: string) => ({ params: Promise.resolve({ id: cat, eventId }) })

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

async function overview() {
  return HealthOverviewSchema.parse(await (await getHealth(request(), params(cat))).json())
}

const doneVisit = {
  status: 'done',
  date: day(-1),
  visit_kind: 'illness',
  clinic: 'Айболит',
  reason: 'Рвота два дня',
  diagnosis: 'Обострение гастрита',
  prescriptions: [
    { name: 'Фортифлора', instructions: '1 пакетик в день, 14 дней', add_to_medications: true },
    { name: 'Лечебный корм', instructions: 'Постоянно', add_to_medications: true },
    { name: 'Смекта', instructions: 'при поносе', add_to_medications: false },
  ],
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  token = await signIn(OWNER_A.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_medications where pet_id = $1`, [cat])
  await db.query(`delete from public.pet_health_events where pet_id = $1`, [cat])
})

afterAll(async () => {
  await db?.end()
})

describe('visits', () => {
  it('two prescriptions to the medicines start two courses, once; the unchecked one none (MR-07.1)', async () => {
    const key = { ...doneVisit }
    const first = await createVisit(
      new NextRequest('http://test.local/x', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'Idempotency-Key': 'visit-key-1' },
        body: JSON.stringify(key),
      }),
      params(cat),
    )
    expect(first.status).toBe(201)
    await createVisit(
      new NextRequest('http://test.local/x', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'Idempotency-Key': 'visit-key-1' },
        body: JSON.stringify(key),
      }),
      params(cat),
    )
    const { medications, events } = await overview()
    expect(medications.map((m) => m.name).sort()).toEqual(['Лечебный корм', 'Фортифлора'])
    expect(medications.every((m) => m.started_on === day(-1))).toBe(true)
    const visit = events.find((e) => e.kind === 'visit')!
    expect(visit).toMatchObject({ visit_kind: 'illness', diagnosis: 'Обострение гастрита', reason: 'Рвота два дня' })
    expect(visit.items.map((i) => [i.name, i.medication_id !== null])).toEqual([
      ['Фортифлора', true],
      ['Лечебный корм', true],
      ['Смекта', false],
    ])
  })

  it('adds a prescription to the medicines later, once', async () => {
    const visit = HealthEventSchema.parse(await (await createVisit(request('POST', doneVisit), params(cat))).json())
    const smecta = visit.items.find((i) => i.name === 'Смекта')!
    expect((await toMedication(request('POST'), { params: Promise.resolve({ id: cat, itemId: smecta.id }) })).status).toBe(201)
    await toMedication(request('POST'), { params: Promise.resolve({ id: cat, itemId: smecta.id }) })
    expect((await overview()).medications.filter((m) => m.name === 'Смекта')).toHaveLength(1)
  })

  it('refuses another owner’s check and a check of another pet (MR-07.2)', async () => {
    const otherOwner = await createVisit(request('POST', { ...doneVisit, prescriptions: [], check_id: CHECK_IDS.bOnly }), params(cat))
    expect(otherOwner.status).toBe(400)
    const otherPet = await createVisit(request('POST', { ...doneVisit, prescriptions: [], check_id: CHECK_IDS.aSecond }), params(cat))
    expect(otherPet.status).toBe(400)
    const own = await createVisit(request('POST', { ...doneVisit, prescriptions: [], check_id: CHECK_IDS.aFirst }), params(cat))
    expect(own.status).toBe(201)
    expect(HealthEventSchema.parse(await own.json()).check_id).toBe(CHECK_IDS.aFirst)
  })

  it('a plan starts no treatment and is a due date; «Был» then allows diagnosis and prescriptions (MR-07.3)', async () => {
    const planned = await createVisit(request('POST', { status: 'planned', date: day(9), visit_kind: 'checkup', clinic: 'Айболит' }), params(cat))
    expect(planned.status).toBe(201)
    const plan = HealthEventSchema.parse(await planned.json())
    expect((await overview()).medications).toEqual([])

    const due = (await (await listDue(request(), undefined)).json()).map((row: unknown) => DueItemSchema.parse(row))
    expect(due.filter((row: { kind: string; pet_id: string }) => row.kind === 'visit' && row.pet_id === cat)).toHaveLength(1)

    const treatmentOnPlan = await patchVisit(request('PATCH', { diagnosis: 'x' }), eventParams(plan.id))
    expect(treatmentOnPlan.status).toBe(400)

    const done = await patchVisit(
      request('PATCH', { status: 'done', date: day(0), diagnosis: 'Здорова', prescriptions: [{ name: 'Витамины', add_to_medications: true }] }),
      eventParams(plan.id),
    )
    expect(done.status).toBe(200)
    const after = HealthEventSchema.parse(await done.json())
    expect(after).toMatchObject({ status: 'done', diagnosis: 'Здорова' })
    expect((await overview()).medications.map((m) => m.name)).toEqual(['Витамины'])
  })

  it('refuses a done visit in the future and a plan in the past', async () => {
    expect((await createVisit(request('POST', { ...doneVisit, date: day(5) }), params(cat))).status).toBe(400)
    expect((await createVisit(request('POST', { status: 'planned', date: day(-5), visit_kind: 'checkup' }), params(cat))).status).toBe(400)
  })

  it('keeps courses and the owner’s changes to them when the visit is corrected or deleted (MR-07.4)', async () => {
    const visit = HealthEventSchema.parse(await (await createVisit(request('POST', doneVisit), params(cat))).json())
    const fortiflora = (await overview()).medications.find((m) => m.name === 'Фортифлора')!
    await patchMedication(request('PATCH', { dosage: '2 пакетика в день' }), { params: Promise.resolve({ id: cat, medicationId: fortiflora.id }) })

    const kept = visit.items.filter((i) => i.name !== 'Фортифлора').map((i) => ({ id: i.id, name: i.name!, instructions: 'иначе' }))
    expect((await patchVisit(request('PATCH', { prescriptions: kept }), eventParams(visit.id))).status).toBe(200)
    let course = (await overview()).medications.find((m) => m.id === fortiflora.id)!
    expect(course.dosage).toBe('2 пакетика в день')

    expect((await deleteEvent(request('DELETE'), eventParams(visit.id))).status).toBe(204)
    const { medications } = await overview()
    course = medications.find((m) => m.id === fortiflora.id)!
    expect(course.dosage).toBe('2 пакетика в день')
    expect(medications.map((m) => m.name).sort()).toEqual(['Лечебный корм', 'Фортифлора'])
    const { rows } = await db.query(`select count(*)::int as n from public.pet_medications where pet_id = $1 and visit_item_id is not null`, [cat])
    expect(rows[0].n).toBe(0)
  })
})
