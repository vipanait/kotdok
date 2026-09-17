import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import type { Client } from 'pg'
import { GET as cronRoute } from '@/app/(backend)/api/cron/deletion-jobs/route'
import { createServiceClient } from '@/server/supabase/server'
import { runDeletionCron } from '@/server/account/deletion-cron'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

let db: Client
let seeded: SeededFixtures

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  // The fixture reset does not truncate job or archive rows; see deletion-worker.test.ts.
  await db.query('delete from public.deletion_jobs')
  await db.query('delete from public.financial_archive')
  process.env.CRON_SECRET = 'integration-cron-secret'
})

afterAll(async () => {
  delete process.env.CRON_SECRET
  await db.end()
})

async function requestDeletion(userId: string): Promise<void> {
  await db.query(`select public.request_account_deletion($1, $2)`, [userId, `hash-${userId}`])
}

function get(authorization?: string) {
  return new NextRequest('http://test.local/api/cron/deletion-jobs', {
    headers: authorization ? { authorization } : {},
  })
}

describe('the deletion cron', () => {
  it('refuses a call without the secret and does nothing', async () => {
    await requestDeletion(seeded.ownerAId)

    expect((await cronRoute(get())).status).toBe(401)
    expect((await cronRoute(get('Bearer nope'))).status).toBe(401)
    const { rows } = await db.query(`select status from public.deletion_jobs where user_id = $1`, [seeded.ownerAId])
    expect(rows[0].status).toBe('pending')
  })

  it('finishes waiting jobs and reports counts without ids', async () => {
    await requestDeletion(seeded.ownerAId)
    await requestDeletion(seeded.ownerBId)

    const response = await cronRoute(get('Bearer integration-cron-secret'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ processed: 2, completed: 2, retried: 0, actionRequired: 0 })
    expect(JSON.stringify(body)).not.toContain(seeded.ownerAId)
    const { rows } = await db.query(`select count(*)::int n from auth.users where id = any($1)`, [
      [seeded.ownerAId, seeded.ownerBId],
    ])
    expect(rows[0].n).toBe(0)
  })

  it('removes finished job records whose retention ran out', async () => {
    await requestDeletion(seeded.ownerAId)
    await db.query(
      `update public.deletion_jobs set status = 'completed', completed_at = now(), retain_until = now() - interval '1 day' where user_id = $1`,
      [seeded.ownerAId],
    )

    const summary = await runDeletionCron(createServiceClient(), async () => 'completed')

    expect(summary.purged).toBe(1)
    const { rows } = await db.query(`select count(*)::int n from public.deletion_jobs where user_id = $1`, [seeded.ownerAId])
    expect(rows[0].n).toBe(0)
  })
})
