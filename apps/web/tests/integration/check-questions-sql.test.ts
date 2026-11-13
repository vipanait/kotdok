import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { createServiceClient } from '@/server/supabase/server'
import { PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

/** CQ-01: the table and the function that hands out a check's three questions. */

let db: Client
let seeded: SeededFixtures

type Reserved = {
  outcome: 'reserved' | 'replayed' | 'in_progress' | 'limit_reached' | 'expired' | 'not_found' | 'key_reused'
  question: { id: string; position: number; question: string; answer: string | null } | null
}

/** A check whose moment is known: the column has no zone and holds UTC. */
const MADE = '2026-11-10 10:00:00'
const at = (hours: number, seconds = 0) => new Date(Date.UTC(2026, 10, 10, 10 + hours, 0, seconds)).toISOString()

async function check(userId = seeded.ownerAId, deleted = false): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.symptom_checks
       (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes, home_care_steps, vet_questions, full_response, created_at, deleted_at)
     values ($1, $2, 'рвота дважды', 'monitor', 'reason', '{}', '{}', '{}', '{}'::jsonb, $3::timestamp, $4)
     returning id`,
    [userId, userId === seeded.ownerAId ? PET_IDS.aCat : null, MADE, deleted ? new Date() : null],
  )
  return rows[0]!.id
}

async function reserve(checkId: string, key: string, now: string, question = 'Можно ли кормить?', userId = seeded.ownerAId): Promise<Reserved> {
  const { rows } = await db.query<{ r: Reserved }>(
    `select public.reserve_check_question($1, $2, $3, $4, 'ru', $5::timestamptz) r`,
    [userId, checkId, question, key, now],
  )
  return rows[0]!.r
}

async function answer(id: string) {
  await db.query(`update public.check_questions set answer = 'ответ', answered_at = now() where id = $1`, [id])
}

/** `n` answered questions, asked a minute apart from the first hour. */
async function answered(checkId: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    const r = await reserve(checkId, `key-answered-${i}`, at(1, i * 60))
    await answer(r.question!.id)
  }
}

const count = async (checkId: string) =>
  (await db.query<{ n: number }>(`select count(*)::int n from public.check_questions where check_id = $1`, [checkId])).rows[0]!.n

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db?.end()
})

describe('reserve_check_question', () => {
  it('gives a new check its first place', async () => {
    const id = await check()
    const r = await reserve(id, 'key-00000001', at(1))
    expect(r.outcome).toBe('reserved')
    expect(r.question).toMatchObject({ position: 1, question: 'Можно ли кормить?', answer: null })
  })

  it('refuses a fourth question and adds no row', async () => {
    const id = await check()
    await answered(id, 3)
    const r = await reserve(id, 'key-00000004', at(2))
    expect(r).toEqual({ outcome: 'limit_reached', question: null })
    expect(await count(id)).toBe(3)
  })

  it('takes a question at 47:59 and refuses one at 48:01, whatever the session zone', async () => {
    const id = await check()
    await db.query(`set time zone 'Asia/Vladivostok'`)
    try {
      expect((await reserve(id, 'key-00000001', at(47, 59 * 60))).outcome).toBe('reserved')
      expect((await reserve(id, 'key-00000002', at(48, 60))).outcome).toBe('expired')
    } finally {
      await db.query(`set time zone 'UTC'`)
    }
  })

  it('replays an answered question for the same key and the same words', async () => {
    const id = await check()
    const first = await reserve(id, 'key-00000001', at(1))
    await answer(first.question!.id)
    const again = await reserve(id, 'key-00000001', at(1, 30))
    expect(again.outcome).toBe('replayed')
    expect(again.question).toMatchObject({ id: first.question!.id, answer: 'ответ' })
    expect(await count(id)).toBe(1)
  })

  it('refuses a key that was used for other words', async () => {
    const id = await check()
    await reserve(id, 'key-00000001', at(1))
    expect((await reserve(id, 'key-00000001', at(1, 5), 'А поить?')).outcome).toBe('key_reused')
  })

  it('says a young unanswered question is in progress, and retakes an abandoned one', async () => {
    const id = await check()
    const first = await reserve(id, 'key-00000001', at(1))
    expect((await reserve(id, 'key-00000001', at(1, 30))).outcome).toBe('in_progress')
    const retaken = await reserve(id, 'key-00000001', at(1, 121))
    expect(retaken.outcome).toBe('reserved')
    expect(retaken.question!.id).not.toBe(first.question!.id)
    expect(await count(id)).toBe(1)
  })

  it('does not let an abandoned question hold a place', async () => {
    const id = await check()
    await answered(id, 2)
    await reserve(id, 'key-abandoned', at(2))
    const r = await reserve(id, 'key-00000003', at(2, 121))
    expect(r.outcome).toBe('reserved')
    expect(r.question!.position).toBe(3)
    expect(await count(id)).toBe(3)
  })

  it('counts a question still being answered against the limit', async () => {
    const id = await check()
    await answered(id, 2)
    await reserve(id, 'key-in-flight', at(2))
    expect((await reserve(id, 'key-00000004', at(2, 10))).outcome).toBe('limit_reached')
  })

  it('knows no check of another owner and no deleted check', async () => {
    const mine = await check()
    expect((await reserve(mine, 'key-00000001', at(1), 'Можно ли кормить?', seeded.ownerBId)).outcome).toBe('not_found')
    const gone = await check(seeded.ownerAId, true)
    expect((await reserve(gone, 'key-00000001', at(1))).outcome).toBe('not_found')
  })

  it('gives the last place to exactly one of two questions asked at once', async () => {
    const id = await check()
    await answered(id, 2)
    const supabase = createServiceClient()
    const ask = (key: string) =>
      supabase.rpc('reserve_check_question', {
        p_user_id: seeded.ownerAId,
        p_check_id: id,
        p_question: 'Можно ли кормить?',
        p_client_key: key,
        p_locale: 'ru',
        p_now: at(2),
      })
    const results = await Promise.all([ask('key-race-0001'), ask('key-race-0002')])
    expect(results.map((r) => r.error)).toEqual([null, null])
    expect(results.map((r) => (r.data as Reserved).outcome).sort()).toEqual(['limit_reached', 'reserved'])
    expect(await count(id)).toBe(3)
  })
})

describe('what removes questions', () => {
  it('goes with its check', async () => {
    const id = await check()
    await answered(id, 2)
    await db.query(`delete from public.symptom_checks where id = $1`, [id])
    expect(await count(id)).toBe(0)
  })

  it('goes with the account', async () => {
    const id = await check()
    await answered(id, 2)
    await db.query(`select public.request_account_deletion($1, $2)`, [seeded.ownerAId, `receipt-${seeded.ownerAId}`])
    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])
    const { rows } = await db.query(`select count(*)::int n from public.check_questions where user_id = $1`, [seeded.ownerAId])
    expect(rows[0]).toEqual({ n: 0 })
  })

  it('takes no question for an account being deleted', async () => {
    const id = await check()
    await db.query(`select public.request_account_deletion($1, $2)`, [seeded.ownerAId, `receipt-${seeded.ownerAId}`])
    await expect(reserve(id, 'key-00000001', at(1))).rejects.toThrow(/not accepting writes/)
  })
})

describe('access', () => {
  it.each(['anon', 'authenticated'])('denies the table and the function to %s', async (role) => {
    const id = await check()
    await db.query('begin')
    try {
      await db.query(`set local role ${role}`)
      await expect(db.query(`select 1 from public.check_questions`)).rejects.toThrow(/permission denied/)
    } finally {
      await db.query('rollback')
    }
    await db.query('begin')
    try {
      await db.query(`set local role ${role}`)
      await expect(
        db.query(`select public.reserve_check_question($1, $2, 'Можно?', 'key-00000001', 'ru')`, [seeded.ownerAId, id]),
      ).rejects.toThrow(/permission denied/)
    } finally {
      await db.query('rollback')
    }
  })
})
