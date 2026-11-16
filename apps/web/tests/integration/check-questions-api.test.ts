import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Client } from 'pg'
import {
  ApiErrorEnvelopeSchema,
  CheckHistoryPageSchema,
  CheckQuestionResultSchema,
  CheckQuestionThreadSchema,
  SymptomCheckRecordSchema,
} from '@lapka/contracts'
import { OWNER_A, OWNER_B, PET_IDS, bearerRequest, connect, seedFixtures, signIn, type SeededFixtures } from './fixtures'

// CQ-01: `GET/POST /api/v1/checks/{id}/questions` on the real database, with the model faked.

const model = vi.hoisted(() => ({ calls: 0, fail: false }))

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0) }] }) }
    chat = {
      completions: {
        create: async () => {
          model.calls += 1
          if (model.fail) throw new Error('model down')
          return { choices: [{ message: { content: JSON.stringify({ answer: 'Небольшими порциями.', alert: 'none', off_topic: false }) } }] }
        },
      },
    }
  },
}))

let db: Client
let seeded: SeededFixtures
let tokenA: string
let tokenB: string

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function routes() {
  return import('@/app/(backend)/api/v1/checks/[id]/questions/route')
}

async function check(hoursAgo = 1): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.symptom_checks
       (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes, home_care_steps, vet_questions, full_response, created_at)
     values ($1, $2, 'рвота дважды', 'monitor', 'reason', '{}', '{}', '{}', '{}'::jsonb, (now() at time zone 'UTC') - make_interval(secs => $3))
     returning id`,
    [seeded.ownerAId, PET_IDS.aCat, hoursAgo * 3600],
  )
  return rows[0]!.id
}

let keys = 0
const newKey = () => `key-${String((keys += 1)).padStart(8, '0')}`

async function get(id: string, token = tokenA) {
  return (await routes()).GET(bearerRequest('/x', {}, token), params(id))
}

async function post(id: string, body: unknown = { question: 'Можно ли кормить?' }, key: string | null = newKey(), token = tokenA) {
  return (await routes()).POST(
    bearerRequest('/x', { method: 'POST', body, headers: key === null ? {} : { 'Idempotency-Key': key } }, token),
    params(id),
  )
}

const code = async (response: Response) => ApiErrorEnvelopeSchema.parse(await response.json()).error.code

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
  model.calls = 0
  model.fail = false
})

afterAll(async () => {
  await db?.end()
})

describe('GET /checks/{id}/questions', () => {
  it('serves an empty, open thread for a new check (criterion 1)', async () => {
    const response = await get(await check())
    expect(response.status).toBe(200)
    expect(CheckQuestionThreadSchema.parse(await response.json())).toMatchObject({ items: [], limit: 3, remaining: 3, closed: null })
  })

  it('says a check older than 48 hours is expired (criterion 4)', async () => {
    const body = CheckQuestionThreadSchema.parse(await (await get(await check(49))).json())
    expect(body.closed).toBe('expired')
  })

  it('is 404 for another owner, a deleted check and an id that is no uuid; 401 without a session (criterion 8)', async () => {
    const id = await check()
    expect((await get(id, tokenB)).status).toBe(404)
    await db.query(`update public.symptom_checks set deleted_at = now() where id = $1`, [id])
    expect((await get(id)).status).toBe(404)
    expect((await get('nope')).status).toBeGreaterThanOrEqual(400)
    const anonymous = await (await routes()).GET(new NextRequest('http://test.local/x'), params(id))
    expect(anonymous.status).toBe(401)
  })
})

describe('POST /checks/{id}/questions', () => {
  it('answers, and the question is then in the thread with two left (criterion 2)', async () => {
    const id = await check()
    const response = await post(id)
    expect(response.status).toBe(200)
    const body = CheckQuestionResultSchema.parse(await response.json())
    expect(body.item).toMatchObject({ question: 'Можно ли кормить?', answer: 'Небольшими порциями.', alert: 'none' })
    expect(body.thread.remaining).toBe(2)
    const thread = CheckQuestionThreadSchema.parse(await (await get(id)).json())
    expect(thread.items.map((item) => item.id)).toEqual([body.item.id])
  })

  it('trims the question before it is stored', async () => {
    const body = CheckQuestionResultSchema.parse(await (await post(await check(), { question: '  Можно ли кормить?  ' })).json())
    expect(body.item.question).toBe('Можно ли кормить?')
  })

  it('is 409 for a fourth question and for a check past its 48 hours, with no model call (criteria 3, 4)', async () => {
    const id = await check()
    for (let i = 0; i < 3; i += 1) expect((await post(id)).status).toBe(200)
    model.calls = 0
    const fourth = await post(id)
    expect(fourth.status).toBe(409)
    expect(await code(fourth)).toBe('conflict')
    expect((await post(await check(49))).status).toBe(409)
    expect(model.calls).toBe(0)
  })

  it('gives the last place to one of two requests sent at once (criterion 5)', async () => {
    const id = await check()
    await post(id)
    await post(id)
    const statuses = (await Promise.all([post(id), post(id)])).map((r) => r.status).sort()
    expect(statuses).toEqual([200, 409])
    expect(CheckQuestionThreadSchema.parse(await (await get(id)).json())).toMatchObject({ remaining: 0, closed: 'limit' })
  })

  it('returns the same answer for the same key without a second model call (criterion 6)', async () => {
    const id = await check()
    const first = await (await post(id, { question: 'Можно ли кормить?' }, 'key-same-0001')).json()
    const again = await post(id, { question: 'Можно ли кормить?' }, 'key-same-0001')
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(first)
    expect(model.calls).toBe(1)
  })

  it('says a key used for other words was reused', async () => {
    const id = await check()
    await post(id, { question: 'Можно ли кормить?' }, 'key-same-0001')
    const response = await post(id, { question: 'А поить?' }, 'key-same-0001')
    expect(response.status).toBe(409)
    const envelope = ApiErrorEnvelopeSchema.parse(await response.json())
    expect(envelope.error).toMatchObject({ code: 'conflict', details: { reason: 'idempotency_key_reused' } })
  })

  it('is 503 when the model does not answer, and the question is not counted (criterion 7)', async () => {
    const id = await check()
    model.fail = true
    const response = await post(id)
    expect(response.status).toBe(503)
    expect(await code(response)).toBe('dependency_unavailable')
    expect(CheckQuestionThreadSchema.parse(await (await get(id)).json())).toMatchObject({ items: [], remaining: 3 })
  })

  it('is 400 without a key, with a short key, a short or long question, or an unknown field', async () => {
    const id = await check()
    expect((await post(id, { question: 'Можно ли кормить?' }, null)).status).toBe(400)
    expect((await post(id, { question: 'Можно ли кормить?' }, 'short')).status).toBe(400)
    expect((await post(id, { question: ' a ' })).status).toBe(400)
    expect((await post(id, { question: 'я'.repeat(501) })).status).toBe(400)
    expect((await post(id, { question: 'Можно ли кормить?', pet_id: PET_IDS.aCat })).status).toBe(400)
    expect(model.calls).toBe(0)
  })

  it('is 404 for another owner and 401 without a session (criterion 8)', async () => {
    const id = await check()
    expect((await post(id, undefined, newKey(), tokenB)).status).toBe(404)
    const anonymous = await (await routes()).POST(
      new NextRequest('http://test.local/x', { method: 'POST', body: JSON.stringify({ question: 'Можно ли кормить?' }), headers: { 'Idempotency-Key': newKey() } }),
      params(id),
    )
    expect(anonymous.status).toBe(401)
    expect(model.calls).toBe(0)
  })

  it('is 429 for the twenty-first question in an hour (criterion 12)', async () => {
    const id = await check()
    await db.query(`select public.consume_rate_limit($1, 20, 3600) from generate_series(1, 20)`, [
      `check_question_create:${seeded.ownerAId}`,
    ])
    const response = await post(id)
    expect(response.status).toBe(429)
    expect(await code(response)).toBe('rate_limited')
  })

  it('may run for 90 seconds', async () => {
    expect((await routes()).maxDuration).toBe(90)
  })
})

describe('what installed builds read (criterion 13)', () => {
  it('serves a check with three questions with exactly the keys it always had', async () => {
    const id = await check()
    for (let i = 0; i < 3; i += 1) await post(id)

    const { GET: getCheck } = await import('@/app/(backend)/api/v1/checks/[id]/route')
    const { GET: listChecks } = await import('@/app/(backend)/api/v1/checks/route')
    const known = Object.keys(SymptomCheckRecordSchema.shape).filter((key) => key !== 'followup').sort()

    // No X-Lapka-Features at all: the oldest build in the stores.
    const one = await (await getCheck(bearerRequest('/x', {}, tokenA), params(id))).json()
    expect(SymptomCheckRecordSchema.safeParse(one).success).toBe(true)
    expect(Object.keys(one).sort()).toEqual(known)

    const page = CheckHistoryPageSchema.parse(await (await listChecks(bearerRequest('/api/v1/checks', {}, tokenA), {} as never)).json())
    const listed = page.items.find((item) => item.id === id)!
    expect(Object.keys(listed).sort()).toEqual(known)
  })
})
