import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  HealthOverviewSchema,
  IDEMPOTENCY_KEY_HEADER,
  MedicationSchema,
  PetSchema,
  VetSummarySchema,
  type Medication,
} from '@lapka/contracts'
import { endCoursePatch, splitCourses } from '@lapka/shared'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { GET as getSummary } from '@/app/(backend)/api/v1/pets/[id]/health/summary/route'
import { GET as getPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import {
  DELETE as deleteMedication,
  PATCH as patchMedication,
} from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/route'
import { blankCourse, draftFromCourse, readCourseChange, readNewCourses, type CourseDraft } from '@/features/medical-record/medications/course-form'
import { courseRecord, coursesPage } from '@/features/medical-record/medications/course-view'
import { importantFacts } from '@/features/medical-record/view-model'
import ru from '@/shared/i18n/dictionaries/ru'
import { addMedications as addMedicationsService, changeMedication, courseOverEverywhere } from '@/server/medical-record/medication-service'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { createServiceClient } from '@/server/supabase/server'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MW-05: medicines and courses against the real database, through what the
// web form sends. Several courses in one save are stored all or none; a
// finished course is history — the server refuses its change; «Завершить
// курс» ends it on the owner's day and it leaves «Принимает сейчас», the pet
// form and the summary while staying in the history; the phone reads the same
// endpoint and sees the same courses; owner B reaches none of it.

let db: Client
let tokenA: string
let tokenB: string
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

function request(token: string, method = 'GET', body?: unknown, key?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  if (key) headers[IDEMPOTENCY_KEY_HEADER] = key
  return new NextRequest('http://test.local/x', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const medParams = (id: string, medicationId: string) => ({ params: Promise.resolve({ id, medicationId }) })

/** A day relative to today in UTC, as the server sees it; the forms are given the same today. */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)

/** What the phone reads for its medicine screens (`api.getHealthOverview`), with a bearer token as it sends. */
async function overview(token = tokenA) {
  return HealthOverviewSchema.parse(await (await getHealth(request(token), params(pet))).json())
}

async function rows(): Promise<number> {
  const { rows: found } = await db.query(`select count(*)::int as n from public.pet_medications where pet_id = $1 and deleted_at is null`, [pet])
  return found[0].n
}

async function formList(): Promise<string[]> {
  return PetSchema.parse(await (await getPet(request(tokenA), params(pet))).json()).medications
}

async function summaryNames(): Promise<string[]> {
  const summary = VetSummarySchema.parse(await (await getSummary(request(tokenA), params(pet))).json())
  return summary.medications.map((course) => course.name)
}

const draft = (key: string, fields: Partial<CourseDraft>): CourseDraft => ({ ...blankCourse(key, TODAY), ...fields })

/** A save of the web form: its own reading of the fields, one key per form. */
async function saveNew(drafts: CourseDraft[], key = crypto.randomUUID()): Promise<Medication[]> {
  const read = readNewCourses(drafts)
  if (!read.ok) throw new Error(`The form refused: ${JSON.stringify(read)}`)
  const response = await addMedications(request(tokenA, 'POST', read.value, key), params(pet))
  expect(response.status).toBe(201)
  return MedicationSchema.array().parse(await response.json())
}

beforeAll(async () => {
  db = await connect()
  owners = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_medications where pet_id in ($1, $2)`, [pet, PET_IDS.aDog])
  await db.query(`update public.pets set medications = '{}' where id in ($1, $2)`, [pet, PET_IDS.aDog])
})

afterAll(async () => {
  await db?.end()
})

describe('criterion 1: a course with an end and one «Постоянно»', () => {
  it('are saved in one request and told apart in the list, the record and the summary', async () => {
    const saved = await saveNew([
      draft('a', { name: 'Фортифлора', dosage: '1 пакетик в день', start: day(-3), end: day(10) }),
      draft('b', { name: 'Лечебный корм', start: day(-3), ongoing: true, end: day(1) }),
    ])
    expect(saved.map((c) => [c.name, c.ended_on, c.ongoing])).toEqual([
      ['Фортифлора', day(10), false],
      ['Лечебный корм', null, true],
    ])

    const record = await overview()
    const page = coursesPage(ru, record, TODAY)
    expect(page.current.map((c) => c.title).sort()).toEqual(['Лечебный корм', 'Фортифлора'])
    const periods = Object.fromEntries(page.current.map((c) => [c.title, c.period]))
    expect(periods['Лечебный корм']).toMatch(/постоянно$/)
    expect(periods['Фортифлора']).toMatch(/–/)

    // The summary for the vet reads the same courses and keeps what tells them apart.
    const summary = VetSummarySchema.parse(await (await getSummary(request(tokenA), params(pet))).json())
    expect(summary.medications.map((c) => [c.name, c.ended_on, c.ongoing]).sort()).toEqual([
      ['Лечебный корм', null, true],
      ['Фортифлора', day(10), false],
    ])
    expect((await formList()).sort()).toEqual(['Лечебный корм', 'Фортифлора'])
  })
})

describe('criterion 2: «Завершить курс»', () => {
  it('ends the course today: it stays in the history and leaves «Принимает сейчас», the pet form and the summary', async () => {
    const [food, other] = await saveNew([
      draft('a', { name: 'Лечебный корм', start: day(-30), ongoing: true }),
      draft('b', { name: 'Омепразол', start: day(-2), end: day(5) }),
    ])
    const response = await patchMedication(request(tokenA, 'PATCH', endCoursePatch(TODAY)), medParams(pet, food.id))
    expect(response.status).toBe(200)
    expect(MedicationSchema.parse(await response.json())).toMatchObject({ ended_on: TODAY, ongoing: false })

    const record = await overview()
    expect(record.medications.map((c) => c.id).sort()).toEqual([food.id, other.id].sort())
    const { current, past } = splitCourses(record.medications, TODAY)
    expect(current.map((c) => c.id)).toEqual([other.id])
    expect(past.map((c) => c.id)).toEqual([food.id])
    expect(importantFacts(ru, record, TODAY).find((fact) => fact.label === 'Принимает сейчас')?.value).toBe('Омепразол')
    expect(await formList()).toEqual(['Омепразол'])
    expect(await summaryNames()).toEqual(['Омепразол'])
    // By the owner's day it is finished now: the web offers no «Изменить».
    expect(courseRecord(ru, pet, record.medications.find((c) => c.id === food.id)!, TODAY, record.writable).editHref).toBeNull()
  })

  it('sent again after a lost answer, answers with the course and changes nothing', async () => {
    const [course] = await saveNew([draft('a', { name: 'Пробиотик', start: day(-20), end: day(-10) })])
    // Finished for everyone long ago: the same values are not a change.
    const again = await patchMedication(request(tokenA, 'PATCH', { ended_on: day(-10), ongoing: false }), medParams(pet, course.id))
    expect(again.status).toBe(200)
    expect(MedicationSchema.parse(await again.json())).toEqual(course)
  })
})

describe('a finished course is history', () => {
  it('refuses any change of it with 409 record_done, and keeps it as it was; deleting it works', async () => {
    const [course] = await saveNew([draft('a', { name: 'Фортифлора', dosage: '1 пакетик в день', start: day(-40), end: day(-26) })])
    for (const change of [{ name: 'Иное' }, { dosage: '2 пакетика' }, { ended_on: day(30) }, { ongoing: true, ended_on: null }, endCoursePatch(TODAY)]) {
      const response = await patchMedication(request(tokenA, 'PATCH', change), medParams(pet, course.id))
      expect(response.status).toBe(409)
      expect((await response.json()).error.code).toBe('record_done')
    }
    expect((await overview()).medications).toEqual([course])
    expect(await findHealthRecord(createServiceClient(), owners.ownerAId, pet, course.id)).toEqual({ kind: 'medication', status: 'finished' })
    expect((await deleteMedication(request(tokenA, 'DELETE'), medParams(pet, course.id))).status).toBe(204)
    expect(await rows()).toBe(0)
  })

  it('counts a course as finished once it has ended in every time zone, and never refuses a course current somewhere', async () => {
    const [course] = await saveNew([draft('a', { name: 'Омепразол', start: '2026-09-01', ongoing: true })])
    const service = createServiceClient()
    // Ended on 26 September (the owner in Moscow pressed «Завершить курс»).
    await db.query(`update public.pet_medications set ongoing = false, ended_on = '2026-09-26' where id = $1`, [course.id])
    // 26 Sep 10:00 UTC: still the 25th at UTC−12 — the course is current somewhere, so a change goes through.
    const early = new Date('2026-09-26T10:00:00Z')
    expect(courseOverEverywhere({ ended_on: '2026-09-26' }, early)).toBe(false)
    const allowed = await changeMedication(service, owners.ownerAId, pet, course.id, { dosage: 'утром' }, early)
    expect(allowed.ok).toBe(true)
    // 26 Sep 12:00 UTC: the 26th everywhere — finished for every owner.
    const late = new Date('2026-09-26T12:00:00Z')
    expect(courseOverEverywhere({ ended_on: '2026-09-26' }, late)).toBe(true)
    expect(await changeMedication(service, owners.ownerAId, pet, course.id, { dosage: 'вечером' }, late)).toEqual({ ok: false, reason: 'record_done' })
    expect(courseOverEverywhere({ ended_on: null }, late)).toBe(false)
  })

  it('lets a current course be corrected — only what the form changed is sent', async () => {
    const [course] = await saveNew([draft('a', { name: 'Лечебный корм', start: day(-5), ongoing: true })])
    const read = readCourseChange(course, { ...draftFromCourse(course), dosage: 'По схеме врача', ongoing: false, end: day(20) })
    expect(read).toEqual({ ok: true, value: { dosage: 'По схеме врача', ended_on: day(20), ongoing: false } })
    if (!read.ok || !read.value) throw new Error('no change')
    const response = await patchMedication(request(tokenA, 'PATCH', read.value), medParams(pet, course.id))
    expect(response.status).toBe(200)
    expect(MedicationSchema.parse(await response.json())).toMatchObject({ id: course.id, dosage: 'По схеме врача', ended_on: day(20), ongoing: false })
    expect(await findHealthRecord(createServiceClient(), owners.ownerAId, pet, course.id)).toEqual({ kind: 'medication', status: 'current' })
  })
})

describe('criterion 3: dates and all-or-none', () => {
  it('the form blocks an end before the start; the server refuses it too and stores nothing', async () => {
    const read = readNewCourses([
      draft('a', { name: 'Первый', start: day(-1) }),
      draft('b', { name: 'Второй', start: day(-1), end: day(-2) }),
    ])
    expect(read).toEqual({ ok: false, problems: { course: { b: { end: 'beforeStart' } } } })
    const direct = await addMedications(
      request(tokenA, 'POST', { items: [{ name: 'Первый', started_on: day(-1) }, { name: 'Второй', started_on: day(-1), ended_on: day(-2) }] }, crypto.randomUUID()),
      params(pet),
    )
    expect(direct.status).toBe(400)
    expect(await rows()).toBe(0)
  })

  it('a batch the database refuses part-way leaves none of its courses (one transaction)', async () => {
    await saveNew([draft('a', { name: 'Было', start: day(-10), ongoing: true })])
    const before = { rows: await rows(), form: await formList() }
    // Past the contract, straight to the storage: the third course breaks the table's range rule.
    const result = await addMedicationsService(
      createServiceClient(),
      owners.ownerAId,
      pet,
      {
        items: [
          { name: 'Первый', started_on: day(-1) },
          { name: 'Второй', started_on: day(-1), ongoing: true },
          { name: 'Третий', started_on: day(-1), ended_on: day(-5) },
        ],
      },
      crypto.randomUUID(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'bad_range' })
    expect({ rows: await rows(), form: await formList() }).toEqual(before)
    const { rows: names } = await db.query(`select name from public.pet_medications where pet_id = $1`, [pet])
    expect(names.map((row: { name: string }) => row.name)).toEqual(['Было'])
  })

  it('a batch whose answer was lost, sent again with the same key, is stored once', async () => {
    const drafts = [draft('a', { name: 'Первый', start: day(-1) }), draft('b', { name: 'Второй', start: day(-1), ongoing: true })]
    const key = crypto.randomUUID()
    const first = await saveNew(drafts, key)
    const retry = await saveNew(drafts, key)
    expect(retry.map((c) => c.id)).toEqual(first.map((c) => c.id))
    expect(await rows()).toBe(2)
    // The same key with other fields is not taken for a second save.
    const changed = readNewCourses([draft('a', { name: 'Первый', start: day(-1), dosage: 'иначе' })])
    if (!changed.ok) throw new Error('refused')
    expect((await addMedications(request(tokenA, 'POST', changed.value, key), params(pet))).status).toBe(409)
    expect(await rows()).toBe(2)
  })
})

describe('criterion 4: one list, read the same by the site and the phone', () => {
  it('the endpoint the phone reads gives the courses the site shows, current and finished alike', async () => {
    const saved = await saveNew([
      draft('a', { name: 'Лечебный корм', start: day(-30), ongoing: true }),
      draft('b', { name: 'Фортифлора', start: day(-40), end: day(-26) }),
    ])
    // The phone's medicine screens: GET /pets/{id}/health, the shared split by the phone's day.
    const phone = await overview()
    const { current, past } = splitCourses(phone.medications, TODAY)
    const site = coursesPage(ru, phone, TODAY)
    expect(current.map((c) => c.id)).toEqual(site.current.map((c) => c.id))
    expect(past.map((c) => c.id)).toEqual(site.past.map((c) => c.id))
    expect(phone.medications.map((c) => c.id).sort()).toEqual(saved.map((c) => c.id).sort())
    // The pet form, which both apps open: the current names only.
    expect(phone.pet.medications).toEqual(['Лечебный корм'])
    expect(await formList()).toEqual(['Лечебный корм'])
  })
})

describe('owner B', () => {
  it('reaches none of owner A’s courses, and A’s stay as they were', async () => {
    const [course] = await saveNew([draft('a', { name: 'Своё', start: day(-3), ongoing: true })])
    expect((await getHealth(request(tokenB), params(pet))).status).toBe(404)
    expect((await addMedications(request(tokenB, 'POST', { items: [{ name: 'x', started_on: TODAY }] }, crypto.randomUUID()), params(pet))).status).toBe(404)
    expect((await patchMedication(request(tokenB, 'PATCH', endCoursePatch(TODAY)), medParams(pet, course.id))).status).toBe(404)
    expect((await deleteMedication(request(tokenB, 'DELETE'), medParams(pet, course.id))).status).toBe(404)
    expect((await patchMedication(request(tokenB, 'PATCH', { name: 'x' }), medParams(PET_IDS.bCat, course.id))).status).toBe(404)
    const service = createServiceClient()
    expect(await findHealthRecord(service, owners.ownerBId, pet, course.id)).toBeNull()
    expect(await findHealthRecord(service, owners.ownerBId, PET_IDS.bCat, course.id)).toBeNull()
    expect(await findHealthRecord(service, owners.ownerAId, PET_IDS.aDog, course.id)).toBeNull()
    expect((await overview()).medications).toEqual([course])
  })
})
