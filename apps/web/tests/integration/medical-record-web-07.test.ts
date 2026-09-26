import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { HealthOverviewSchema, IDEMPOTENCY_KEY_HEADER, PetSchema, VetSummarySchema } from '@lapka/contracts'
import { POST as createPet } from '@/app/(backend)/api/v1/pets/route'
import { DELETE as deletePet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { GET as getSummary } from '@/app/(backend)/api/v1/pets/[id]/health/summary/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import { coursesPage } from '@/features/medical-record/medications/course-view'
import { vetSummaryPage } from '@/features/medical-record/summary/summary-view'
import { importantFacts } from '@/features/medical-record/view-model'
import ru from '@/shared/i18n/dictionaries/ru'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures } from './fixtures'

// MW-07: the summary for the vet against the real database, as the web page
// builds it. It says what the saved record says — «Принимает сейчас» is the
// same list in the record and in the summary, a course that starts later in
// neither; an empty pet is «не указано», never an absence; owner B reaches
// neither the summary of A's pet nor A the summary of B's.

let db: Client
let tokenA: string
let tokenB: string
const created: string[] = []

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(token: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
  }
  return new NextRequest('http://test.local/x', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

/** A day relative to today in UTC, as the server sees it; the page is given the same today. */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)

async function newPet(body: Record<string, unknown>): Promise<string> {
  const response = await createPet(request(tokenA, 'POST', body), undefined)
  expect(response.status).toBe(201)
  const pet = PetSchema.parse(await response.json())
  created.push(pet.id)
  return pet.id
}

async function ok(response: Response) {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response
}

async function summaryOf(petId: string, token = tokenA) {
  const response = await getSummary(request(token), params(petId))
  return { status: response.status, body: await response.json() }
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

afterAll(async () => {
  for (const id of created) await deletePet(request(tokenA, 'DELETE'), params(id))
  await db?.end()
})

describe('the summary for the vet (MW-07)', () => {
  it('says what the saved record says, «Принимает сейчас» included', async () => {
    const pet = await newPet({ species: 'cat', name: 'Сводка', sex: 'female', neutered: true, allergies: ['Курица'], vaccinated: true })
    await ok(await addWeight(request(tokenA, 'POST', { measured_on: day(-60), weight_kg: 4.5 }), params(pet)))
    await ok(await addWeight(request(tokenA, 'POST', { measured_on: day(-5), weight_kg: 4.2 }), params(pet)))
    await ok(
      await createEvent(
        request(tokenA, 'POST', { kind: 'vaccination', status: 'done', date: day(-30), items: [{ name: 'Нобивак Rabies', targets: ['rabies'], next_on: day(335) }] }),
        params(pet),
      ),
    )
    await ok(
      await createVisit(
        request(tokenA, 'POST', {
          status: 'done',
          date: day(-10),
          visit_kind: 'illness',
          clinic: 'Айболит',
          diagnosis: 'Обострение гастрита',
          prescriptions: [{ name: 'Фортифлора', instructions: '1 пакетик', add_to_medications: false }],
        }),
        params(pet),
      ),
    )
    await ok(
      await addMedications(
        request(tokenA, 'POST', {
          items: [
            { name: 'Лечебный корм', dosage: 'По схеме врача', started_on: day(-20), ongoing: true },
            { name: 'Витамины', started_on: day(7), ongoing: true },
            { name: 'Омепразол', started_on: day(-40), ended_on: day(-30) },
          ],
        }),
        params(pet),
      ),
    )

    const record = HealthOverviewSchema.parse(await (await getHealth(request(tokenA), params(pet))).json())
    const { status, body } = await summaryOf(pet)
    expect(status).toBe(200)
    const summary = VetSummarySchema.parse(body)
    const page = vetSummaryPage(ru, 'ru', summary, TODAY)

    // One list: the record's «Важно знать» and the summary name the same course; the later one is in neither.
    expect(importantFacts(ru, record, TODAY).find((fact) => fact.label === 'Принимает сейчас')?.value).toBe('Лечебный корм · постоянно')
    expect(summary.medications.map((course) => course.name)).toEqual(['Лечебный корм'])
    expect(page.important).toEqual({
      kind: 'facts',
      facts: [
        { label: 'Аллергии', text: 'Курица' },
        { label: 'Хронические болезни', text: 'Не указано владельцем' },
        { label: 'Принимает сейчас', text: expect.stringMatching(/^Лечебный корм · По схеме врача, постоянно с /) },
      ],
    })
    // It is still a current course of the medicines page, with its start date.
    expect(coursesPage(ru, record, TODAY).current.map((card) => card.title)).toContain('Витамины')

    // The tables are the saved records.
    expect(page.vaccinations.kind).toBe('table')
    const rabies = page.vaccinations.kind === 'table' ? page.vaccinations.table.rows.find((row) => row.key === 'rabies') : undefined
    expect(rabies?.cells.map((cell) => cell.text)).toEqual(['Бешенство', expect.stringMatching(/^\d\d\.\d\d\.\d{4}$/), 'Нобивак Rabies', expect.any(String)])
    expect(page.visits.kind === 'table' && page.visits.table.rows[0].cells.map((cell) => cell.text).slice(1)).toEqual([
      'Обострение гастрита',
      'Фортифлора — 1 пакетик',
    ])
    expect(page.parasites).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.weight).toMatchObject({ kind: 'measured', latest: expect.stringContaining('4,2 кг') })
    expect(page.pet.meta).toBe('Кошка · самка · стерилизована')
  })

  it('shows an empty pet as not stated, never as an absence', async () => {
    const pet = await newPet({ species: 'dog', name: 'Пустой' })
    const summary = VetSummarySchema.parse((await summaryOf(pet)).body)
    const page = vetSummaryPage(ru, 'ru', summary, TODAY)
    expect(page.pet).toEqual({ name: 'Пустой', meta: 'Собака', weight: 'Вес: не указано владельцем' })
    expect(page.important).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    // The core diseases are listed by the server with nothing in them: that is no record, not «не привит».
    expect(summary.vaccinations.length).toBeGreaterThan(0)
    expect(page.vaccinations).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.parasites).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.visits).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.weight).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.checks).toEqual({ note: 'Пока нет проверок' })
    expect(JSON.stringify(page)).not.toMatch(/\bнет (болезней|аллергий|лекарств)\b/i)
  })

  it('is not found for another owner’s pet, either way', async () => {
    expect((await summaryOf(PET_IDS.aCat, tokenB)).status).toBe(404)
    expect((await summaryOf(PET_IDS.bCat, tokenA)).status).toBe(404)
    expect((await summaryOf(PET_IDS.bDeleted, tokenB)).status).toBe(404)
  })
})
