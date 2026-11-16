import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from 'pg'
import { createServiceClient } from '@/server/supabase/server'
import { RATE_LIMITS } from '@/server/api/rate-limit'
import { PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// CQ-01: asking a question about a check, on the real database, with the model faked.

type ChatRequest = { messages: { role: string; content: unknown }[]; max_completion_tokens?: number }

const model = vi.hoisted(() => ({
  requests: [] as { messages: { role: string; content: unknown }[]; max_completion_tokens?: number }[],
  options: [] as unknown[],
  embedded: [] as string[],
  embedOptions: [] as unknown[],
  embedFail: false,
  reply: '' as string,
  fail: false,
  /** Resolved by the test to let a held answer through. */
  hold: null as Promise<void> | null,
}))

vi.mock('openai', () => ({
  default: class {
    embeddings = {
      create: async (request: { input: string }, options: unknown) => {
        model.embedded.push(request.input)
        model.embedOptions.push(options)
        if (model.embedFail) throw new Error('embeddings down')
        return { data: [{ embedding: new Array(1536).fill(0) }] }
      },
    }
    chat = {
      completions: {
        create: async (request: ChatRequest, options: unknown) => {
          model.requests.push(request)
          model.options.push(options)
          if (model.hold) await model.hold
          if (model.fail) throw new Error('model down')
          return { choices: [{ message: { content: model.reply } }] }
        },
      },
    }
  },
}))

let db: Client
let seeded: SeededFixtures

const said = (value: Record<string, unknown>) => JSON.stringify(value)

async function check(options: { hoursAgo?: number; petId?: string | null; urgency?: string; userId?: string } = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.symptom_checks
       (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes, species_specific_warning,
        home_care_steps, vet_questions, full_response, locale, created_at)
     values ($1, $2, 'рвота дважды за день', $3, 'два эпизода без других признаков', array['съел непривычное'], 'коты скрывают боль',
        array['уберите корм на два часа'], array['нужен ли анализ?'],
        '{"appetite":"reduced","pain_signs":["hiding"],"photo_observations":"шерсть чистая","has_photo":true}'::jsonb,
        'ru', (now() at time zone 'UTC') - make_interval(secs => $4))
     returning id`,
    [
      options.userId ?? seeded.ownerAId,
      options.petId === undefined ? PET_IDS.aCat : options.petId,
      options.urgency ?? 'monitor',
      (options.hoursAgo ?? 1) * 3600,
    ],
  )
  return rows[0]!.id
}

let keys = 0
async function ask(checkId: string, question = 'Можно ли кормить?', clientKey = `key-${String((keys += 1)).padStart(8, '0')}`, userId = seeded.ownerAId) {
  const { askCheckQuestion } = await import('@/server/check-questions/check-question-service')
  return askCheckQuestion(createServiceClient(), { userId, checkId, question, clientKey })
}

async function thread(checkId: string, userId = seeded.ownerAId, now?: Date) {
  const { getQuestionThread } = await import('@/server/check-questions/check-question-service')
  return getQuestionThread(createServiceClient(), userId, checkId, now)
}

const rowsOf = async (checkId: string) =>
  (await db.query(`select question, answer, alert, off_topic from public.check_questions where check_id = $1 order by created_at`, [checkId])).rows

async function balance() {
  const { rows } = await db.query(`select credits from public.profiles where id = $1`, [seeded.ownerAId])
  const ledger = await db.query(`select count(*)::int n from public.credit_ledger where user_id = $1`, [seeded.ownerAId])
  return { credits: rows[0].credits as number, ledger: ledger.rows[0].n as number }
}

const userText = (request: ChatRequest) => String(request.messages.find((m) => m.role === 'user')!.content)

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  model.requests.length = 0
  model.options.length = 0
  model.embedded.length = 0
  model.embedOptions.length = 0
  model.embedFail = false
  model.fail = false
  model.hold = null
  model.reply = said({ answer: 'Небольшими порциями через два часа.', alert: 'none', off_topic: false })
})

afterAll(async () => {
  await db?.end()
})

describe('the thread of a check', () => {
  it('is empty and open for 48 hours from the check', async () => {
    const id = await check({ hoursAgo: 2 })
    const result = await thread(id)
    expect(result).toMatchObject({ ok: true, data: { items: [], limit: 3, remaining: 3, closed: null } })
    if (!result.ok) return
    // A zone-less column: read it as text, it is UTC.
    const { rows } = await db.query<{ created_at: string }>(`select created_at::text from public.symptom_checks where id = $1`, [id])
    const made = new Date(`${rows[0]!.created_at.replace(' ', 'T')}Z`).getTime()
    expect(new Date(result.data.open_until).getTime() - made).toBe(48 * 3_600_000)
  })

  it('closes as expired once the 48 hours have passed', async () => {
    const id = await check({ hoursAgo: 49 })
    expect(await thread(id)).toMatchObject({ ok: true, data: { remaining: 3, closed: 'expired' } })
  })

  it('is not there for another owner or a deleted check', async () => {
    const id = await check()
    expect(await thread(id, seeded.ownerBId)).toEqual({ ok: false, reason: 'not_found' })
    await db.query(`update public.symptom_checks set deleted_at = now() where id = $1`, [id])
    expect(await thread(id)).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('asking a question', () => {
  it('answers, stores the answer and leaves two questions', async () => {
    const id = await check()
    const result = await ask(id)
    expect(result).toMatchObject({
      ok: true,
      data: {
        item: { question: 'Можно ли кормить?', answer: 'Небольшими порциями через два часа.', alert: 'none', off_topic: false },
        thread: { remaining: 2, closed: null },
      },
    })
    expect(model.requests).toHaveLength(1)
    expect(await rowsOf(id)).toEqual([
      { question: 'Можно ли кормить?', answer: 'Небольшими порциями через два часа.', alert: 'none', off_topic: false },
    ])
    expect(await thread(id)).toMatchObject({ ok: true, data: { remaining: 2, items: [{ question: 'Можно ли кормить?' }] } })
  })

  it('costs no credit and writes nothing to the ledger', async () => {
    const id = await check()
    const before = await balance()
    await ask(id)
    expect(await balance()).toEqual(before)
  })

  it('shows the model the check, its result, the pet with its record, and what was asked before', async () => {
    const id = await check()
    await db.query(
      `insert into public.pet_health_events (user_id, pet_id, kind, status, event_date, title)
       values ($1, $2, 'vaccination', 'done', current_date - 30, 'Нобивак')`,
      [seeded.ownerAId, PET_IDS.aCat],
    ).catch(() => undefined)
    await ask(id, 'Можно ли поить?')
    model.reply = said({ answer: 'Через два часа.', alert: 'none' })
    await ask(id, 'А кормить?')
    await ask(id, 'На что смотреть ночью?')

    const request = model.requests.at(-1)!
    const text = userText(request)
    for (const part of [
      'рвота дважды за день',
      'два эпизода без других признаков',
      'съел непривычное',
      'уберите корм на два часа',
      'нужен ли анализ?',
      'коты скрывают боль',
      'шерсть чистая',
      'Appetite: eating less than usual',
      'PET PROFILE: species: cat, Мурка',
      'На что смотреть ночью?',
    ]) {
      expect(text).toContain(part)
    }
    expect(text.indexOf('Можно ли поить?')).toBeLessThan(text.indexOf('А кормить?'))
    expect(text).toContain('Небольшими порциями через два часа.')
    expect(JSON.stringify(request.messages)).not.toContain('image_url')
    expect(typeof request.messages.find((m) => m.role === 'user')!.content).toBe('string')
    // The knowledge base is searched by the symptoms and the question together.
    expect(model.embedded.at(-1)).toContain('рвота дважды за день')
    expect(model.embedded.at(-1)).toContain('На что смотреть ночью?')
    expect(request.max_completion_tokens).toBe(500)
    expect(model.options.at(-1)).toMatchObject({ timeout: 30_000, maxRetries: 1 })
  })

  it('bounds the knowledge-base search to five seconds and answers without it when it fails', async () => {
    const id = await check()
    model.embedFail = true
    expect(await ask(id)).toMatchObject({ ok: true, data: { thread: { remaining: 2 } } })
    expect(model.embedOptions.at(-1)).toMatchObject({ timeout: 5_000, maxRetries: 0 })
    const system = String(model.requests.at(-1)!.messages.find((m) => m.role === 'system')!.content)
    expect(system).toContain('No additional context available.')
  })

  it('answers about a check made without a pet, with no pet block', async () => {
    const id = await check({ petId: null })
    expect(await ask(id)).toMatchObject({ ok: true })
    expect(userText(model.requests[0]!)).not.toContain('PET PROFILE')
  })

  it('keeps an alert stronger than the check and drops one that is not', async () => {
    model.reply = said({ answer: 'Это опасно.', alert: 'clinic_now' })
    expect(await ask(await check({ urgency: 'monitor' }))).toMatchObject({ ok: true, data: { item: { alert: 'clinic_now' } } })
    expect(await ask(await check({ urgency: 'emergency' }))).toMatchObject({ ok: true, data: { item: { alert: 'none' } } })
  })

  it('answers an off-topic question with the fixed sentence, and counts it', async () => {
    model.reply = said({ answer: 'Завтра дождь.', off_topic: true })
    const result = await ask(await check(), 'Какая завтра погода?')
    expect(result).toMatchObject({
      ok: true,
      data: { item: { answer: 'Я могу ответить только на вопросы по этой проверке.', off_topic: true, alert: 'none' }, thread: { remaining: 2 } },
    })
  })

  it('refuses a fourth question without asking the model, and closes the thread', async () => {
    const id = await check()
    for (const q of ['Раз?', 'Два?', 'Три?']) await ask(id, q)
    expect(await thread(id)).toMatchObject({ ok: true, data: { remaining: 0, closed: 'limit' } })
    model.requests.length = 0
    expect(await ask(id, 'Четыре?')).toEqual({ ok: false, reason: 'conflict' })
    expect(model.requests).toHaveLength(0)
  })

  it('refuses a question about a check older than 48 hours without asking the model', async () => {
    expect(await ask(await check({ hoursAgo: 49 }))).toEqual({ ok: false, reason: 'conflict' })
    expect(model.requests).toHaveLength(0)
  })

  it('returns the stored answer for a repeated key and asks the model once', async () => {
    const id = await check()
    const first = await ask(id, 'Можно ли кормить?', 'key-repeat-01')
    model.reply = said({ answer: 'Другой ответ.' })
    const again = await ask(id, 'Можно ли кормить?', 'key-repeat-01')
    expect(again).toEqual(first)
    expect(model.requests).toHaveLength(1)
  })

  it('refuses a key reused for other words', async () => {
    const id = await check()
    await ask(id, 'Можно ли кормить?', 'key-repeat-01')
    expect(await ask(id, 'А поить?', 'key-repeat-01')).toEqual({ ok: false, reason: 'key_reused' })
  })

  it('tells a retry that arrives while the first is still waiting to come back later', async () => {
    const id = await check()
    let release!: () => void
    model.hold = new Promise<void>((resolve) => { release = resolve })
    const first = ask(id, 'Можно ли кормить?', 'key-repeat-01')
    await vi.waitFor(() => expect(model.requests).toHaveLength(1))
    expect(await ask(id, 'Можно ли кормить?', 'key-repeat-01')).toEqual({ ok: false, reason: 'conflict' })
    release()
    expect(await first).toMatchObject({ ok: true })
    expect(model.requests).toHaveLength(1)
    expect(await thread(id)).toMatchObject({ ok: true, data: { remaining: 2 } })
  })

  it('gives the place back when the model does not answer', async () => {
    const id = await check()
    model.fail = true
    expect(await ask(id)).toEqual({ ok: false, reason: 'model_unavailable' })
    expect(await rowsOf(id)).toEqual([])
    expect(await thread(id)).toMatchObject({ ok: true, data: { remaining: 3 } })
  })

  it('gives the place back when the model answers with something that is not an answer', async () => {
    const id = await check()
    model.reply = 'I am sorry'
    expect(await ask(id)).toEqual({ ok: false, reason: 'model_unavailable' })
    model.reply = said({ answer: '   ' })
    expect(await ask(id)).toEqual({ ok: false, reason: 'model_unavailable' })
    expect(await rowsOf(id)).toEqual([])
  })

  it('knows no check of another owner', async () => {
    const id = await check()
    expect(await ask(id, 'Можно ли кормить?', 'key-foreign-1', seeded.ownerBId)).toEqual({ ok: false, reason: 'not_found' })
    expect(model.requests).toHaveLength(0)
  })

  it('stops at the hourly limit before it reaches the database or the model', async () => {
    const id = await check()
    expect(RATE_LIMITS.check_question_create).toEqual({ limit: 20, windowSeconds: 3600 })
    await db.query(
      `select public.consume_rate_limit($1, 20, 3600) from generate_series(1, 20)`,
      [`check_question_create:${seeded.ownerAId}`],
    )
    expect(await ask(id)).toEqual({ ok: false, reason: 'too_many_requests' })
    expect(model.requests).toHaveLength(0)
    expect(await rowsOf(id)).toEqual([])
  })
})

describe('the questions a re-check reads', () => {
  it('lists the answered questions in order, with their alerts and without the answers', async () => {
    const id = await check()
    await ask(id, 'Можно ли кормить?')
    model.reply = said({ answer: 'Это меняет картину.', alert: 'see_vet_today' })
    await ask(id, 'Он не ест второй день')
    const { questionsForRecheck } = await import('@/server/check-questions/check-question-service')
    expect(await questionsForRecheck(createServiceClient(), seeded.ownerAId, id)).toEqual([
      { question: 'Можно ли кормить?', alert: 'none' },
      { question: 'Он не ест второй день', alert: 'see_vet_today' },
    ])
  })
})
