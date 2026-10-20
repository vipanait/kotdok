import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { MedicationDoseSchema, MedicationSchema } from '@lapka/contracts'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { PUT as setTimes } from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/times/route'
import { DELETE as unmarkDose, POST as markDose } from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/doses/route'
import { GET as listDoses } from '@/app/(backend)/api/v1/pets/[id]/health/doses/route'
import { DELETE as deleteCourse } from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/route'
import { DELETE as deletePet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures } from './fixtures'

/** FB-5: the times a course is given at, and «дали» for a dose. */

let db: Client
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

function request(token: string, method = 'GET', body?: unknown, url = 'http://test.local/x') {
  return new NextRequest(url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const medParams = (id: string, medicationId: string) => ({ params: Promise.resolve({ id, medicationId }) })
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

async function newCourse(petId: string = PET_IDS.aCat): Promise<string> {
  const response = await addMedications(request(tokenA, 'POST', { items: [{ name: 'Нефростоп', dosage: '1 таблетка', started_on: day(-3) }] }), params(petId))
  const [course] = (await response.json()).map((row: unknown) => MedicationSchema.parse(row))
  return course.id
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

afterAll(async () => {
  await db?.end()
})

describe('the times a course is given at (FB-5/01)', () => {
  it('are saved, read back sorted and without repeats, and a course starts with none', async () => {
    const id = await newCourse()
    const saved = await setTimes(request(tokenA, 'PUT', { reminder_times: ['20:00', '08:00'] }), medParams(PET_IDS.aCat, id))
    expect(saved.status).toBe(200)
    expect(MedicationSchema.parse(await saved.json()).reminder_times).toEqual(['08:00', '20:00'])
  })

  it('refuses a time that is not one, more than four, and a course that is not the caller’s', async () => {
    const id = await newCourse()
    expect((await setTimes(request(tokenA, 'PUT', { reminder_times: ['25:00'] }), medParams(PET_IDS.aCat, id))).status).toBe(400)
    expect((await setTimes(request(tokenA, 'PUT', { reminder_times: ['08:00', '09:00', '10:00', '11:00', '12:00'] }), medParams(PET_IDS.aCat, id))).status).toBe(400)
    expect((await setTimes(request(tokenB, 'PUT', { reminder_times: ['08:00'] }), medParams(PET_IDS.bCat, id))).status).toBe(404)
  })
})

describe('«дали» (FB-5/02)', () => {
  it('marks a dose once, however often it is sent, reads it back and takes it back', async () => {
    const id = await newCourse()
    await setTimes(request(tokenA, 'PUT', { reminder_times: ['08:00'] }), medParams(PET_IDS.aCat, id))
    const body = { taken_on: day(0), slot: '08:00' }
    const first = await markDose(request(tokenA, 'POST', body), medParams(PET_IDS.aCat, id))
    const second = await markDose(request(tokenA, 'POST', body), medParams(PET_IDS.aCat, id))
    expect([first.status, second.status]).toEqual([201, 200])
    expect(MedicationDoseSchema.parse(await second.json())).toMatchObject({ medication_id: id, ...body })

    const url = `http://test.local/x?from=${day(-1)}&to=${day(1)}`
    const read = (await (await listDoses(request(tokenA, 'GET', undefined, url), params(PET_IDS.aCat))).json()) as unknown[]
    expect(read.filter((dose) => (dose as { medication_id: string }).medication_id === id)).toHaveLength(1)

    const undone = await unmarkDose(request(tokenA, 'DELETE', undefined, `http://test.local/x?taken_on=${day(0)}&slot=08:00`), medParams(PET_IDS.aCat, id))
    expect(undone.status).toBe(204)
    const after = (await (await listDoses(request(tokenA, 'GET', undefined, url), params(PET_IDS.aCat))).json()) as unknown[]
    expect(after.filter((dose) => (dose as { medication_id: string }).medication_id === id)).toHaveLength(0)
  })

  it('refuses a time the course is not given at, a day ahead, and another person’s course', async () => {
    const id = await newCourse()
    await setTimes(request(tokenA, 'PUT', { reminder_times: ['08:00'] }), medParams(PET_IDS.aCat, id))
    expect((await markDose(request(tokenA, 'POST', { taken_on: day(0), slot: '09:00' }), medParams(PET_IDS.aCat, id))).status).toBe(400)
    expect((await markDose(request(tokenA, 'POST', { taken_on: day(3), slot: '08:00' }), medParams(PET_IDS.aCat, id))).status).toBe(400)
    expect((await markDose(request(tokenB, 'POST', { taken_on: day(0), slot: '08:00' }), medParams(PET_IDS.bCat, id))).status).toBe(404)
  })
})

describe('the journal goes with the course and the pet (FB-5/02)', () => {
  async function givenDose(petId: string): Promise<string> {
    const id = await newCourse(petId)
    await setTimes(request(tokenA, 'PUT', { reminder_times: ['08:00'] }), medParams(petId, id))
    expect((await markDose(request(tokenA, 'POST', { taken_on: day(0), slot: '08:00' }), medParams(petId, id))).status).toBe(201)
    return id
  }
  const dosesOf = async (column: 'medication_id' | 'pet_id', id: string) =>
    (await db.query(`select count(*)::int as n from public.medication_doses where ${column} = $1`, [id])).rows[0].n as number

  it('when the course is deleted', async () => {
    const id = await givenDose(PET_IDS.aCat)
    expect(await dosesOf('medication_id', id)).toBe(1)
    const deleted = await deleteCourse(request(tokenA, 'DELETE', undefined, `http://test.local/x?today=${day(0)}`), medParams(PET_IDS.aCat, id))
    expect(deleted.status).toBe(204)
    expect(await dosesOf('medication_id', id)).toBe(0)
  })

  it('when the pet is deleted', async () => {
    await givenDose(PET_IDS.aDog)
    expect(await dosesOf('pet_id', PET_IDS.aDog)).toBe(1)
    expect((await deletePet(request(tokenA, 'DELETE'), params(PET_IDS.aDog))).status).toBeLessThan(300)
    expect(await dosesOf('pet_id', PET_IDS.aDog)).toBe(0)
  })
})
