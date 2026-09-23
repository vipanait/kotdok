import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { createServiceClient } from '@/server/supabase/server'
import {
  createDeletionWorkerDeps,
  processDeletionJob,
  type DeletionWorkerDeps,
} from '@/server/account/deletion-worker'
import { readDeletionStatus } from '@/server/account/deletion-status'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 8/05 end to end: the real worker against the real database and Auth.
 * Faults are injected by wrapping one real dependency, so every other step is
 * the code that runs in production.
 */

let db: Client
let seeded: SeededFixtures
const RECEIPT = 'a'.repeat(64)

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  // The fixture reset truncates the business tables but not these: jobs and
  // archive rows have no foreign key to the users it removes.
  await db.query('delete from public.deletion_jobs')
  await db.query('delete from public.financial_archive')
})

afterAll(async () => {
  await db.end()
})

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, params)
  return Number(rows[0].n)
}

async function requestDeletion(userId: string, receipt = RECEIPT): Promise<void> {
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(receipt, 'utf8').digest('hex')
  await db.query(`select public.request_account_deletion($1, $2)`, [userId, hash])
}

function realDeps(): DeletionWorkerDeps {
  return { ...createDeletionWorkerDeps(createServiceClient()), log: () => {} }
}

async function job(userId: string) {
  const { rows } = await db.query(
    `select status, attempts, progress, retain_until is not null retained from public.deletion_jobs where user_id = $1`,
    [userId],
  )
  return rows[0]
}

describe('the deletion worker against the real database', () => {
  it('deletes the account and completes the job', async () => {
    await requestDeletion(seeded.ownerAId)

    await expect(processDeletionJob(realDeps(), seeded.ownerAId)).resolves.toBe('completed')

    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(0)
    expect(await count(`select count(*) n from public.profiles where id = $1`, [seeded.ownerAId])).toBe(0)
    expect(await job(seeded.ownerAId)).toMatchObject({ status: 'completed', retained: true })
    const status = await readDeletionStatus(createServiceClient(), RECEIPT)
    expect(status).toMatchObject({ found: true, status: 'completed' })
  })

  it('leaves the other owner signed in and whole', async () => {
    await requestDeletion(seeded.ownerAId)

    await processDeletionJob(realDeps(), seeded.ownerAId)

    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerBId])).toBe(1)
    expect(await count(`select count(*) n from public.pets where user_id = $1`, [seeded.ownerBId])).toBe(2)
  })

  it('resumes after the Auth step failed, without touching the data again', async () => {
    await requestDeletion(seeded.ownerAId)
    const failing = { ...realDeps(), deleteAuthUser: async () => { throw new Error('auth down') } }

    await expect(processDeletionJob(failing, seeded.ownerAId)).resolves.toBe('retry')
    expect(await job(seeded.ownerAId)).toMatchObject({ status: 'in_progress', attempts: 1 })
    expect(Object.keys((await job(seeded.ownerAId)).progress).sort()).toEqual(['data', 'photos'])
    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(1)

    let dataRanAgain = false
    const resumed = { ...realDeps(), deleteAccountData: async () => void (dataRanAgain = true) }
    await expect(processDeletionJob(resumed, seeded.ownerAId)).resolves.toBe('completed')
    expect(dataRanAgain).toBe(false)
    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(0)
  })

  it('leaves nothing half-deleted when the data step fails', async () => {
    await requestDeletion(seeded.ownerAId)
    const deps = realDeps()
    const failing = {
      ...deps,
      deleteAccountData: async (userId: string) => {
        await deps.deleteAccountData(userId)
        throw new Error('connection dropped after commit')
      },
    }

    await expect(processDeletionJob(failing, seeded.ownerAId)).resolves.toBe('retry')
    await expect(processDeletionJob(realDeps(), seeded.ownerAId)).resolves.toBe('completed')
    expect(await count(`select count(*) n from public.financial_archive where subject_ref = $1`, [seeded.ownerAId])).toBe(4)
  })

  it('lets only one of two simultaneous runs do the work', async () => {
    await requestDeletion(seeded.ownerAId)

    const results = await Promise.all([
      processDeletionJob(realDeps(), seeded.ownerAId),
      processDeletionJob(realDeps(), seeded.ownerAId),
    ])

    expect([...results].sort()).toEqual(['completed', 'not_claimed'])
  })

  it('stops at action_required after five failures and says so to the receipt', async () => {
    await requestDeletion(seeded.ownerAId)
    const failing = { ...realDeps(), deleteAuthUser: async () => { throw new Error('down') } }

    const results = []
    for (let attempt = 0; attempt < 5; attempt++) results.push(await processDeletionJob(failing, seeded.ownerAId))

    expect(results).toEqual(['retry', 'retry', 'retry', 'retry', 'action_required'])
    const status = await readDeletionStatus(createServiceClient(), RECEIPT)
    expect(status).toMatchObject({ found: true, status: 'action_required' })
    await expect(processDeletionJob(realDeps(), seeded.ownerAId)).resolves.toBe('not_claimed')
  })

  it('treats an Auth user that is already gone as a finished step', async () => {
    const result = await createDeletionWorkerDeps(createServiceClient()).deleteAuthUser(randomUUID())
    expect(result).toBe('absent')
  })
})
