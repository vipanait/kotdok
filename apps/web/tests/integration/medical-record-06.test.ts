import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { HealthOverviewSchema, IDEMPOTENCY_KEY_HEADER, MedicationSchema } from '@lapka/contracts'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import {
  DELETE as deleteMedication,
  PATCH as patchMedication,
} from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/route'
import { PATCH as patchPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures } from './fixtures'

// MR-06: medication courses and the pet form's list, against the real database.

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

function request(token: string, method = 'GET', body?: unknown, key?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  if (key) headers[IDEMPOTENCY_KEY_HEADER] = key
  return new NextRequest('http://test.local/x', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const medParams = (id: string, medicationId: string) => ({ params: Promise.resolve({ id, medicationId }) })

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

async function overview() {
  return HealthOverviewSchema.parse(await (await getHealth(request(tokenA), params(pet))).json())
}

async function formList(): Promise<string[]> {
  const { rows } = await db.query(`select medications from public.pets where id = $1`, [pet])
  return rows[0].medications
}

/** Saves the pet form with a medicines list, as the phone does. */
async function saveForm(medications: string[]) {
  const response = await patchPet(request(tokenA, 'PATCH', { name: 'Мурка', species: 'cat', medications }), params(pet))
  expect(response.status).toBe(200)
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_medications where pet_id = $1`, [pet])
  await db.query(`update public.pets set medications = '{}' where id = $1`, [pet])
})

afterAll(async () => {
  await db?.end()
})

describe('the form’s old list', () => {
  it('becomes current courses with an unknown start, once however often it runs (MR-06.1)', async () => {
    await db.query(`update public.pets set medications = array['Лечебный корм', 'Фортифлора'] where id = $1`, [pet])
    await db.query(`select public.backfill_pet_medications()`)
    await db.query(`select public.backfill_pet_medications()`)
    const { medications } = await overview()
    expect(medications.map((m) => [m.name, m.started_on, m.source]).sort()).toEqual([
      ['Лечебный корм', null, 'form'],
      ['Фортифлора', null, 'form'],
    ])
  })
})

describe('the pet form and the courses', () => {
  it('starts a course today for a name added in the form, and nothing when the list is saved again (MR-06.1)', async () => {
    await saveForm(['Лечебный корм'])
    await saveForm(['Лечебный корм'])
    const { medications } = await overview()
    expect(medications).toHaveLength(1)
    expect(medications[0]).toMatchObject({ name: 'Лечебный корм', dosage: null, source: 'form' })
    expect(medications[0].started_on).not.toBeNull()
  })

  it('ends the course when the name is removed in the form, keeping it in the history (MR-06.2)', async () => {
    await saveForm(['Лечебный корм', 'Фортифлора'])
    await saveForm(['Лечебный корм'])
    const { medications } = await overview()
    const fortiflora = medications.find((m) => m.name === 'Фортифлора')!
    expect(fortiflora.ended_on).not.toBeNull()
    expect(await formList()).toEqual(['Лечебный корм'])
  })

  it('takes the name out of the form when the course is ended in the record (MR-06.2)', async () => {
    await saveForm(['Лечебный корм'])
    const [course] = (await overview()).medications
    const response = await patchMedication(
      request(tokenA, 'PATCH', { ended_on: day(0), ongoing: false }),
      medParams(pet, course.id),
    )
    expect(response.status).toBe(200)
    expect(await formList()).toEqual([])
    expect((await overview()).medications).toHaveLength(1)
  })

  it('does not start again a course that ran out while the form still lists it', async () => {
    await saveForm(['Фортифлора'])
    const [course] = (await overview()).medications
    await db.query(`update public.pet_medications set started_on = $2, ended_on = $3 where id = $1`, [course.id, day(-20), day(-1)])
    await saveForm(['Фортифлора'])
    expect((await overview()).medications).toHaveLength(1)
  })
})

describe('courses in the medical record', () => {
  it('keeps two courses of one name apart (MR-06.3)', async () => {
    const response = await addMedications(
      request(tokenA, 'POST', {
        items: [
          { name: 'Фортифлора', dosage: '1 пакетик в день', started_on: '2026-08-02', ended_on: '2026-08-15' },
          { name: 'Фортифлора', dosage: '2 пакетика в день', started_on: day(-3), ongoing: true },
        ],
      }),
      params(pet),
    )
    expect(response.status).toBe(201)
    const created = (await response.json()).map((row: unknown) => MedicationSchema.parse(row))
    expect(created).toHaveLength(2)
    expect(new Set(created.map((m: { id: string }) => m.id)).size).toBe(2)
    expect(await formList()).toEqual(['Фортифлора'])
  })

  it('adds the batch once for a repeated key, and refuses the key with other data', async () => {
    const body = { items: [{ name: 'Омепразол', started_on: day(-1) }, { name: 'Пробиотик', started_on: day(-1) }] }
    await addMedications(request(tokenA, 'POST', body, 'meds-key-1'), params(pet))
    const again = await addMedications(request(tokenA, 'POST', body, 'meds-key-1'), params(pet))
    expect(again.status).toBe(201)
    expect((await again.json()).length).toBe(2)
    expect((await overview()).medications).toHaveLength(2)
    const other = await addMedications(request(tokenA, 'POST', { items: [{ name: 'Другое' }] }, 'meds-key-1'), params(pet))
    expect(other.status).toBe(409)
  })

  it('refuses an end before the start and an end on an ongoing course (MR-06.4)', async () => {
    const backwards = await addMedications(
      request(tokenA, 'POST', { items: [{ name: 'x', started_on: '2026-08-15', ended_on: '2026-08-02' }] }),
      params(pet),
    )
    expect(backwards.status).toBe(400)
    const created = MedicationSchema.parse(
      (await (await addMedications(request(tokenA, 'POST', { items: [{ name: 'x', started_on: '2026-08-15' }] }), params(pet))).json())[0],
    )
    const bad = await patchMedication(request(tokenA, 'PATCH', { ended_on: '2026-08-01' }), medParams(pet, created.id))
    expect(bad.status).toBe(400)
  })

  it('deletes a course and forgets it in the form', async () => {
    const [course] = (await (await addMedications(request(tokenA, 'POST', { items: [{ name: 'Ошибка', started_on: day(-1) }] }), params(pet))).json()).map(
      (row: unknown) => MedicationSchema.parse(row),
    )
    expect(await formList()).toEqual(['Ошибка'])
    expect((await deleteMedication(request(tokenA, 'DELETE'), medParams(pet, course.id))).status).toBe(204)
    expect(await formList()).toEqual([])
  })

  it('does not let another owner see or touch a course', async () => {
    const [course] = (await (await addMedications(request(tokenA, 'POST', { items: [{ name: 'Своё', started_on: day(-1) }] }), params(pet))).json()).map(
      (row: unknown) => MedicationSchema.parse(row),
    )
    expect((await addMedications(request(tokenB, 'POST', { items: [{ name: 'x' }] }), params(pet))).status).toBe(404)
    expect((await patchMedication(request(tokenB, 'PATCH', { name: 'угнали' }), medParams(pet, course.id))).status).toBe(404)
    expect((await deleteMedication(request(tokenB, 'DELETE'), medParams(pet, course.id))).status).toBe(404)
    const asB = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${tokenB}` } },
    })
    expect((await asB.from('pet_medications').select('id').eq('pet_id', pet)).data).toEqual([])
  })
})
