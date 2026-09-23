import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 6/01–6/02, the database half: the bucket's own limits and the one
 * function that turns uploads into photos of a check.
 */

let db: Client
let seeded: SeededFixtures

async function upload(userId: string, minutesLeft = 15): Promise<string> {
  const { rows } = await db.query(
    `insert into public.photo_uploads (user_id, object_path, content_type, size_bytes, expires_at)
     values ($1::uuid, $1::text || '/' || gen_random_uuid(), 'image/jpeg', 1000, now() + make_interval(mins => $2::int))
     returning id`,
    [userId, minutesLeft],
  )
  return rows[0].id
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  seeded = await seedFixtures(db)
  await db.query('truncate table public.photo_uploads')
})

afterAll(async () => {
  await db?.end()
})

describe('check-photos bucket', () => {
  it('is private and limited to the three formats and 5 MB', async () => {
    const { rows } = await db.query(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'check-photos'`,
    )
    expect(rows).toEqual([
      { public: false, file_size_limit: '5242880', allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
    ])
  })
})

describe('claim_photo_uploads', () => {
  it('attaches the owner’s fresh uploads and returns where they are', async () => {
    const a = await upload(seeded.ownerAId)
    const b = await upload(seeded.ownerAId)

    const { rows } = await db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [a, b]])

    expect(rows.map((row) => row.id).sort()).toEqual([a, b].sort())
    const { rows: attached } = await db.query(
      'select count(*)::int as n from public.photo_uploads where attached_at is not null',
    )
    expect(attached[0].n).toBe(2)
  })

  it.each([
    ['someone else’s', () => upload(seeded.ownerBId)],
    ['an expired one', () => upload(seeded.ownerAId, -1)],
    ['an unknown id', async () => '00000000-0000-4000-8000-000000000000'],
  ])('refuses the whole set when one of them is %s, and attaches nothing', async (_label, make) => {
    const good = await upload(seeded.ownerAId)
    const bad = await make()

    await expect(
      db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [good, bad]]),
    ).rejects.toThrow(/uploads_unavailable/)

    const { rows } = await db.query('select attached_at from public.photo_uploads where id = $1', [good])
    expect(rows[0].attached_at).toBeNull()
  })

  it('does not attach the same upload to a second check', async () => {
    const a = await upload(seeded.ownerAId)
    await db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [a]])

    await expect(
      db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [a]]),
    ).rejects.toThrow(/uploads_unavailable/)
  })

  it('is not callable by signed-in users', async () => {
    const { rows } = await db.query(
      `select has_function_privilege('authenticated', 'public.claim_photo_uploads(uuid, uuid[])', 'execute') as can`,
    )
    expect(rows[0].can).toBe(false)
  })
})

describe('mark_deletion_step', () => {
  it('knows the photos step', async () => {
    const { rows } = await db.query(
      `select pg_get_functiondef('public.mark_deletion_step(uuid, text)'::regprocedure) as def`,
    )
    expect(rows[0].def).toContain(`'photos'`)
  })
})
