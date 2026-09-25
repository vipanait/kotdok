import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { DueItemSchema, HealthOverviewSchema, PetSchema, VetSummarySchema } from '@lapka/contracts'
import { POST as createPet } from '@/app/(backend)/api/v1/pets/route'
import { DELETE as deletePet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { GET as getSummary } from '@/app/(backend)/api/v1/pets/[id]/health/summary/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { GET as listDue } from '@/app/(backend)/api/v1/pets/due/route'
import { createServiceClient } from '@/server/supabase/server'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MR-11: the whole medical record as one path, two owners, and what deleting leaves behind.

const model = vi.hoisted(() => ({ prompts: [] as string[] }))

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0) }] }) }
    chat = {
      completions: {
        create: async (request: { messages: { role: string; content: unknown }[] }) => {
          const user = request.messages.find((message) => message.role === 'user')!.content as { text?: string }[]
          model.prompts.push(user.map((part) => part.text ?? '').join('\n'))
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    urgency: 'monitor', urgency_reason: 'ok', possible_causes: [], species_specific_warning: null, home_care_steps: [], vet_questions: [],
                  }),
                },
              },
            ],
          }
        },
      },
    }
  },
}))

let db: Client
let seeded: SeededFixtures
const tokens: Record<'a' | 'b', string> = { a: '', b: '' }

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(who: 'a' | 'b', method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://test.local/x', {
    method,
    headers: { authorization: `Bearer ${tokens[who]}`, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

async function ok(response: Response, status = 201) {
  expect(response.status, await response.clone().text()).toBe(status)
  return response.json()
}

/** Reads as the owner would through the database's own rules, not the service role. */
function asOwner(token: string) {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

async function count(sql: string, values: unknown[]): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, values)
  return Number(rows[0].n)
}

let petId = ''

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
  tokens.a = await signIn(OWNER_A.email)
  tokens.b = await signIn(OWNER_B.email)
  await db.query(`update public.profiles set credits = 20 where id = $1`, [seeded.ownerAId])
  await db.query(`delete from public.api_rate_limits where bucket like $1`, [`%${seeded.ownerAId}%`])
})

afterAll(async () => {
  await db?.end()
})

describe('the medical record as one path (MR-11)', () => {
  it('goes from a new pet to a check that reads its record', async () => {
    const pet = PetSchema.parse(
      await ok(await createPet(request('a', 'POST', { name: 'Кольцо', species: 'cat', age_years: 2, weight_kg: 3.9, medications: ['Капли'] }))),
    )
    petId = pet.id

    await ok(await addWeight(request('a', 'POST', { measured_on: day(-1), weight_kg: 4.0 }), params(petId)))
    await ok(
      await createEvent(
        request('a', 'POST', { kind: 'vaccination', status: 'done', date: day(-2), items: [{ name: 'Нобивак Rabies', targets: ['rabies'], next_on: day(363) }] }),
        params(petId),
      ),
    )
    await ok(
      await createEvent(request('a', 'POST', { kind: 'parasite', status: 'planned', date: day(5), items: [{ name: 'Мильбемакс', targets: ['worms'] }] }), params(petId)),
    )
    await ok(
      await createVisit(
        request('a', 'POST', {
          status: 'done', date: day(-3), visit_kind: 'illness', diagnosis: 'Гастрит',
          prescriptions: [{ name: 'Фортифлора', instructions: '1 пакетик', add_to_medications: true }],
        }),
        params(petId),
      ),
    )
    await ok(await addMedications(request('a', 'POST', { items: [{ name: 'Витамины', started_on: day(-1), ongoing: true }] }), params(petId)))

    const overview = HealthOverviewSchema.parse(await ok(await getHealth(request('a'), params(petId)), 200))
    expect(overview.events.map((event) => event.kind).sort()).toEqual(['parasite', 'vaccination', 'vaccination', 'visit'])
    // The form's medicine became a course; the prescription and the new course joined it.
    expect(overview.medications.map((course) => course.name).sort()).toEqual(['Витамины', 'Капли', 'Фортифлора'])

    const due = ((await ok(await listDue(request('a'), undefined), 200)) as unknown[]).map((row) => DueItemSchema.parse(row))
    expect(due.filter((row) => row.pet_id === petId).map((row) => row.kind).sort()).toEqual(['parasite', 'vaccination'])

    const summary = VetSummarySchema.parse(await ok(await getSummary(request('a'), params(petId)), 200))
    expect(summary.visits.map((visit) => visit.diagnosis)).toEqual(['Гастрит'])
    // The form's weight at creation is today's measurement; the record's yesterday's.
    expect(summary.weights.map((weight) => weight.weight_kg)).toEqual([3.9, 4.0])

    const { analyzeSymptomCheck } = await import('@/server/symptom-check/analyze-symptom-check')
    const outcome = await analyzeSymptomCheck(createServiceClient(), {
      userId: seeded.ownerAId, symptoms: 'не ест', petId, photos: [], appetite: null, activity: null, duration: null, stool: null, pain_signs: [],
    })
    expect(outcome.ok).toBe(true)
    expect(model.prompts.at(-1)).toContain('diagnosis "Гастрит" (past, may no longer apply)')
  })

  it('shows another owner nothing, through the API or the database rules', async () => {
    expect((await getHealth(request('b'), params(petId))).status).toBe(404)
    expect((await getSummary(request('b'), params(petId))).status).toBe(404)
    expect((await addWeight(request('b', 'POST', { measured_on: day(0), weight_kg: 9 }), params(petId))).status).toBe(404)
    const due = (await ok(await listDue(request('b'), undefined), 200)) as { pet_id: string }[]
    expect(due.some((row) => row.pet_id === petId)).toBe(false)

    for (const table of ['pet_weights', 'pet_health_events', 'pet_health_items', 'pet_medications']) {
      const other = await asOwner(tokens.b).from(table).select('id').eq('pet_id', petId)
      expect({ table, rows: other.data?.length ?? 0 }).toEqual({ table, rows: 0 })
      const own = await asOwner(tokens.a).from(table).select('id').eq('pet_id', petId)
      expect({ table, seen: (own.data?.length ?? 0) > 0 }).toEqual({ table, seen: true })
      // Nobody writes around the API.
      const write = await asOwner(tokens.a).from(table).delete().eq('pet_id', petId).select('id')
      expect({ table, deleted: write.data?.length ?? 0 }).toEqual({ table, deleted: 0 })
    }
  })

  it('does a repeated request once', async () => {
    const body = { kind: 'vaccination', status: 'planned', date: day(30), items: [{ name: null, targets: ['felv'] }] }
    await ok(await createEvent(request('a', 'POST', body, { 'Idempotency-Key': 'mr11-repeat-key' }), params(petId)))
    await ok(await createEvent(request('a', 'POST', body, { 'Idempotency-Key': 'mr11-repeat-key' }), params(petId)))
    expect(await count(`select count(*) n from public.pet_health_events where pet_id = $1 and idempotency_key = 'mr11-repeat-key'`, [petId])).toBe(1)
  })

  it('leaves no trace of a deleted pet in the record, the due list or the summary', async () => {
    expect((await deletePet(request('a', 'DELETE'), params(petId))).status).toBe(204)
    expect((await getHealth(request('a'), params(petId))).status).toBe(404)
    expect((await getSummary(request('a'), params(petId))).status).toBe(404)
    const due = (await ok(await listDue(request('a'), undefined), 200)) as { pet_id: string }[]
    expect(due.some((row) => row.pet_id === petId)).toBe(false)
  })

  it('removes every medical row of an account that is deleted, and nothing of another', async () => {
    const otherBefore = await count(`select count(*) n from public.pet_medications where user_id = $1`, [seeded.ownerBId])
    await db.query(`select public.request_account_deletion($1, $2)`, [seeded.ownerAId, `receipt-${seeded.ownerAId}`])
    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])
    for (const table of ['pet_weights', 'pet_health_events', 'pet_health_items', 'pet_medications']) {
      expect({ table, left: await count(`select count(*) n from public.${table} where user_id = $1`, [seeded.ownerAId]) }).toEqual({ table, left: 0 })
    }
    expect(await count(`select count(*) n from public.pet_medications where user_id = $1`, [seeded.ownerBId])).toBe(otherBefore)
  })
})
