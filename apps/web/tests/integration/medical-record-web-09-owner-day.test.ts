import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { DueListReadSchema, HealthEventSchema, HealthOverviewSchema, IDEMPOTENCY_KEY_HEADER } from '@lapka/contracts'

// The analysis itself is replaced: what is checked is the day the route hands
// it, not what a model makes of the record.
const analysed = vi.hoisted(() => [] as Array<string | undefined>)
vi.mock('@/server/symptom-check/analyze-symptom-check', () => ({
  analyzeSymptomCheck: vi.fn(async (_supabase: unknown, input: { today?: string }) => {
    analysed.push(input.today)
    return { ok: false, code: 'dependency_unavailable', message: 'not in this test' }
  }),
}))

import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { GET as getDue } from '@/app/(backend)/api/v1/pets/due/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { PATCH as patchMedication, DELETE as deleteMedication } from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { PATCH as patchVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/[eventId]/route'
import { POST as prescriptionToMedication } from '@/app/(backend)/api/v1/pets/[id]/health/items/[itemId]/medication/route'
import { POST as createCheck } from '@/app/(backend)/api/v1/checks/route'
import { loadAnalysisContext } from '@/server/medical-record/analysis-context'
import { getVetSummary } from '@/server/medical-record/summary-service'
import { requestToday } from '@/server/medical-record/weight-service'
import { createServiceClient } from '@/server/supabase/server'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MW-09 Task 2: where the server counted the day by UTC (MW-08, decision c),
// it now takes the owner's day when the app says it (`?today=`, inside
// `clientToday`'s window) — the pet form's list of current medicines in
// GET /health, the list the writes of courses and visits refresh, and the
// record an analysis reads. Without it, or outside the window, as before.
//
// The owner is put a day ahead of UTC (east, `?today=` = tomorrow UTC): a
// course ending tomorrow (UTC) is still current for the server, and already
// over for the owner. And a day behind (west): a course that ended today
// (UTC) is still current for the owner.

let db: Client
let tokenA: string
let owners: SeededFixtures
const pet: string = PET_IDS.aCat

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(method: string, body?: unknown, query = '', key?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' }
  if (key) headers[IDEMPOTENCY_KEY_HEADER] = key
  return new NextRequest(`http://test.local/api/v1/x${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const medParams = (medicationId: string) => ({ params: Promise.resolve({ id: pet, medicationId }) })
const eventParams = (eventId: string) => ({ params: Promise.resolve({ id: pet, eventId }) })
const itemParams = (itemId: string) => ({ params: Promise.resolve({ id: pet, itemId }) })

// One reading of the clock for the whole file.
const NOW = Date.now()
function day(offset: number): string {
  return new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)
const EAST = `?today=${day(1)}`
const WEST = `?today=${day(-1)}`

/** A course straight into the table, as any earlier save would have left it. */
async function course(name: string, ended_on: string | null): Promise<string> {
  const { rows } = await db.query(
    `insert into public.pet_medications (user_id, pet_id, name, started_on, ended_on) values ($1, $2, $3, $4, $5) returning id`,
    [owners.ownerAId, pet, name, day(-10), ended_on],
  )
  return rows[0].id as string
}

async function storedList(): Promise<string[]> {
  const { rows } = await db.query(`select medications from public.pets where id = $1`, [pet])
  return rows[0].medications as string[]
}

async function formList(query = ''): Promise<string[]> {
  const response = await getHealth(request('GET', undefined, query), params(pet))
  expect(response.status).toBe(200)
  return HealthOverviewSchema.parse(await response.json()).pet.medications
}

beforeAll(async () => {
  db = await connect()
  owners = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
})

beforeEach(async () => {
  analysed.length = 0
  await db.query(`delete from public.pet_medications where pet_id = $1`, [pet])
  await db.query(`delete from public.pet_health_events where pet_id = $1`, [pet])
  await db.query(`update public.pets set medications = '{}' where id = $1`, [pet])
})

afterAll(async () => {
  await db?.end()
})

describe('the owner’s day of a request', () => {
  it('is `?today=` inside the window, the server’s UTC day otherwise', () => {
    const now = new Date(NOW)
    const url = (query: string) => new URL(`http://test.local/x${query}`)
    expect(requestToday(url(EAST), now)).toBe(day(1))
    expect(requestToday(url(WEST), now)).toBe(day(-1))
    expect(requestToday(url(''), now)).toBe(TODAY)
    expect(requestToday(url(`?today=${day(3)}`), now)).toBe(TODAY)
    expect(requestToday(url(`?today=${day(-3)}`), now)).toBe(TODAY)
    expect(requestToday(url('?today=tomorrow'), now)).toBe(TODAY)
  })
})

describe('GET /health: the pet form’s list of medicines on the owner’s day', () => {
  it('an owner ahead of UTC no longer lists a course that ends on their today', async () => {
    await course('Ends tomorrow UTC', day(1))
    await course('Ongoing', null)
    expect(await formList(EAST)).toEqual(['Ongoing'])
    // Without the day (installed apps), and with one outside the window: the UTC day, as before.
    expect((await formList()).sort()).toEqual(['Ends tomorrow UTC', 'Ongoing'])
    expect((await formList(`?today=${day(5)}`)).sort()).toEqual(['Ends tomorrow UTC', 'Ongoing'])
  })

  it('an owner behind UTC still lists a course that ended today in UTC', async () => {
    await course('Ended today UTC', TODAY)
    expect(await formList(WEST)).toEqual(['Ended today UTC'])
    expect(await formList()).toEqual([])
  })

  it('the summary counts the form’s list from its own day', async () => {
    await course('Ends tomorrow UTC', day(1))
    await course('Ongoing', null)
    const east = await getVetSummary(createServiceClient(), owners.ownerAId, pet, day(1))
    const utc = await getVetSummary(createServiceClient(), owners.ownerAId, pet)
    expect(east.ok && east.data.pet.medications).toEqual(['Ongoing'])
    expect(utc.ok && [...utc.data.pet.medications].sort()).toEqual(['Ends tomorrow UTC', 'Ongoing'])
  })
})

describe('writes of courses and visits refresh the stored list on the owner’s day', () => {
  it('adding courses', async () => {
    const add = (query: string) =>
      addMedications(request('POST', { items: [{ name: 'Ends tomorrow UTC', started_on: day(-2), ended_on: day(1) }] }, query, crypto.randomUUID()), params(pet))
    expect((await add(EAST)).status).toBe(201)
    expect(await storedList()).toEqual([])
    expect((await add('')).status).toBe(201)
    expect(await storedList()).toEqual(['Ends tomorrow UTC'])
  })

  it('deleting a course', async () => {
    await course('Ends tomorrow UTC', day(1))
    const first = await course('Other', null)
    const second = await course('Another', null)
    expect((await deleteMedication(request('DELETE', undefined, ''), medParams(first))).status).toBe(204)
    expect(await storedList()).toEqual(['Ends tomorrow UTC', 'Another'])
    expect((await deleteMedication(request('DELETE', undefined, EAST), medParams(second))).status).toBe(204)
    expect(await storedList()).toEqual([])
  })

  it('correcting a course: the list is counted from the owner’s day, not from the end it sends', async () => {
    await course('Ends tomorrow UTC', day(1))
    const other = await course('Other', null)
    expect((await patchMedication(request('PATCH', { dosage: 'утром' }, EAST), medParams(other))).status).toBe(200)
    expect(await storedList()).toEqual(['Other'])
    expect((await patchMedication(request('PATCH', { dosage: 'вечером' }), medParams(other))).status).toBe(200)
    expect((await storedList()).sort()).toEqual(['Ends tomorrow UTC', 'Other'])
  })

  it('a visit that happened, with a prescription to take', async () => {
    await course('Ends tomorrow UTC', day(1))
    const body = { status: 'done', date: TODAY, visit_kind: 'illness', prescriptions: [{ name: 'Смекта', add_to_medications: true }] }
    expect((await createVisit(request('POST', body, EAST, crypto.randomUUID()), params(pet))).status).toBe(201)
    expect(await storedList()).toEqual(['Смекта'])
  })

  it('«Состоялся» with a prescription, and «Добавить в лекарства» later', async () => {
    await course('Ends tomorrow UTC', day(1))
    const planned = await createVisit(request('POST', { status: 'planned', date: TODAY, visit_kind: 'checkup' }, '', crypto.randomUUID()), params(pet))
    const visit = HealthEventSchema.parse(await planned.json())
    // The list as the UTC day has it (a plan with no prescriptions does not touch it).
    await db.query(`update public.pets set medications = '{Ends tomorrow UTC}' where id = $1`, [pet])

    const held = await patchVisit(
      request('PATCH', { status: 'done', prescriptions: [{ name: 'Смекта', add_to_medications: false }, { name: 'Фортифлора', add_to_medications: true }] }, EAST, crypto.randomUUID()),
      eventParams(visit.id),
    )
    expect(held.status).toBe(200)
    expect(await storedList()).toEqual(['Фортифлора'])

    // Back to the UTC day's list, then «Добавить в лекарства» on the other prescription, by the owner's day.
    await db.query(`update public.pets set medications = '{Ends tomorrow UTC}' where id = $1`, [pet])
    const smecta = HealthEventSchema.parse(await held.json()).items.find((item) => item.name === 'Смекта')!
    const added = await prescriptionToMedication(request('POST', undefined, EAST), itemParams(smecta.id))
    expect(added.status).toBe(201)
    expect((await storedList()).sort()).toEqual(['Смекта', 'Фортифлора'])
  })
})

describe('the analysis reads the record on the owner’s day', () => {
  it('the medicines of the pet’s profile and the record block', async () => {
    await course('Ends tomorrow UTC', day(1))
    await course('Ongoing', null)
    const east = await loadAnalysisContext(createServiceClient(), owners.ownerAId, pet, day(1))
    const utc = await loadAnalysisContext(createServiceClient(), owners.ownerAId, pet)
    expect(east.medications).toEqual(['Ongoing'])
    expect([...(utc.medications ?? [])].sort()).toEqual(['Ends tomorrow UTC', 'Ongoing'])
    expect(east.text).toContain(`as of ${day(1)}`)
    expect(utc.text).toContain(`as of ${TODAY}`)
  })

  it('POST /checks hands `?today=` to the analysis, inside the window only', async () => {
    const send = (query: string) => createCheck(request('POST', { pet_id: pet, symptoms: 'Не ест второй день' }, query, crypto.randomUUID()), params(pet))
    await send(EAST)
    await send('')
    await send(`?today=${day(4)}`)
    expect(analysed).toEqual([day(1), TODAY, TODAY])
  })
})

describe('/pets/due names a planned visit’s kind (spec §7.1)', () => {
  it('sends visit_kind for a planned visit and null for the rest', async () => {
    await createVisit(request('POST', { status: 'planned', date: day(3), visit_kind: 'surgery' }, '', crypto.randomUUID()), params(pet))
    const response = await getDue(request('GET'), { params: Promise.resolve({}) } as never)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<{ pet_id: string; kind: string; visit_kind: unknown }>
    const mine = body.filter((entry) => entry.pet_id === pet)
    expect(mine).toEqual([expect.objectContaining({ kind: 'visit', visit_kind: 'surgery' })])
    expect(body.filter((entry) => entry.kind !== 'visit').every((entry) => entry.visit_kind === null)).toBe(true)
    // The apps read it through the lenient schema.
    expect(DueListReadSchema.parse(body).find((entry) => entry.pet_id === pet)?.visit_kind).toBe('surgery')
  })
})
