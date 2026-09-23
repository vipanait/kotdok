import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { CHECK_IDS, connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'
import { createCheckJob, type Analyse } from '@/server/checks/check-job-service'
import { PHOTO_BUCKET, grantUploads } from '@/server/uploads/photo-storage'

/**
 * Stage 6/02: what a check does with the photos it was given. The AI call is
 * a fake that records what it received — the point is everything around it.
 */

let db: Client
let fixtures: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// 1600×1200. The empty APP0 before SOF0 is needed: see photo-verify.test.ts.
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40,
  0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
])

/** Asks for grants and writes each file, as the phone would. */
async function uploaded(userId: string, bodies: Uint8Array<ArrayBuffer>[]): Promise<string[]> {
  const grant = await grantUploads(
    service() as never,
    userId,
    bodies.map((body) => ({ content_type: 'image/jpeg' as const, size_bytes: body.byteLength })),
  )
  for (const [i, upload] of grant!.uploads.entries()) {
    const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bodies[i] })
    if (!response.ok) throw new Error(`upload failed: ${response.status}`)
  }
  return grant!.uploads.map((upload) => upload.upload_id)
}

function recording() {
  const seen = { photos: 0, calls: 0 }
  const analyse: Analyse = async (_supabase, input) => {
    seen.calls += 1
    seen.photos = input.photos.length
    return {
      ok: true,
      result: {} as never,
      checkId: CHECK_IDS.aFirst,
      creditsRemaining: 4,
      hasPhoto: input.photos.length > 0,
      quickAssessment: { appetite: null, activity: null, duration: null, stool: null, pain_signs: [] },
    }
  }
  return { seen, analyse }
}

function request(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    idempotencyKey: null,
    pet_id: null,
    symptoms: 'хромает на заднюю лапу',
    upload_ids: [],
    appetite: null,
    activity: null,
    duration: null,
    stool: null,
    pain_signs: [],
    ...overrides,
  } as Parameters<typeof createCheckJob>[1]
}

async function counts() {
  const { rows } = await db.query(
    `select (select count(*)::int from storage.objects where bucket_id = $1) as objects,
            (select count(*)::int from public.photo_uploads) as uploads,
            (select count(*)::int from public.check_jobs) as jobs`,
    [PHOTO_BUCKET],
  )
  return rows[0] as { objects: number; uploads: number; jobs: number }
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  fixtures = await seedFixtures(db)
  await service().storage.emptyBucket(PHOTO_BUCKET)
  await db.query('truncate table public.check_jobs, public.photo_uploads')
})

afterAll(async () => {
  await db?.end()
})

describe('a check with photos', () => {
  it('gives the analysis every photo, then leaves nothing in storage', async () => {
    const ids = await uploaded(fixtures.ownerAId, [JPEG, JPEG, JPEG])
    const { seen, analyse } = recording()

    const outcome = await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: ids }), analyse)

    expect(outcome).toMatchObject({ ok: true })
    expect(seen.photos).toBe(3)
    expect(await counts()).toEqual({ objects: 0, uploads: 0, jobs: 1 })
  })

  it('removes the photos when the analysis fails too', async () => {
    const ids = await uploaded(fixtures.ownerAId, [JPEG])
    const fails: Analyse = async () => ({ ok: false, code: 'dependency_unavailable', message: 'AI недоступен' })

    await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: ids }), fails)

    expect(await counts()).toMatchObject({ objects: 0, uploads: 0 })
  })

  it('refuses a granted upload whose file never arrived, before any job or credit', async () => {
    const grant = await grantUploads(service() as never, fixtures.ownerAId, [
      { content_type: 'image/jpeg', size_bytes: 10 },
    ])
    const { seen, analyse } = recording()

    const outcome = await createCheckJob(
      service() as never,
      request(fixtures.ownerAId, { upload_ids: [grant!.uploads[0].upload_id] }),
      analyse,
    )

    expect(outcome).toMatchObject({ ok: false, code: 'bad_request' })
    expect(seen.calls).toBe(0)
    expect(await counts()).toEqual({ objects: 0, uploads: 0, jobs: 0 })
  })

  it('refuses a file that only claims to be a JPEG, and removes it', async () => {
    const ids = await uploaded(fixtures.ownerAId, [new TextEncoder().encode('<html>not a photo</html>')])
    const { seen, analyse } = recording()

    const outcome = await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: ids }), analyse)

    expect(outcome).toMatchObject({ ok: false, code: 'unsupported_media_type' })
    expect(seen.calls).toBe(0)
    expect(await counts()).toEqual({ objects: 0, uploads: 0, jobs: 0 })
  })

  it('refuses someone else’s upload and leaves it to its owner', async () => {
    const theirs = await uploaded(fixtures.ownerBId, [JPEG])
    const { analyse } = recording()

    const outcome = await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: theirs }), analyse)

    expect(outcome).toMatchObject({ ok: false, code: 'bad_request' })
    expect(await counts()).toMatchObject({ objects: 1, uploads: 1 })
  })

  it('answers a repeat of the same request with the job already made', async () => {
    const ids = await uploaded(fixtures.ownerAId, [JPEG])
    const { analyse } = recording()
    const same = request(fixtures.ownerAId, { upload_ids: ids, idempotencyKey: 'photo-repeat-0001' })

    const first = await createCheckJob(service() as never, same, analyse)
    const again = await createCheckJob(service() as never, same, analyse)

    expect(first).toMatchObject({ ok: true, reused: false })
    expect(again).toMatchObject({ ok: true, reused: true })
    if (first.ok && again.ok) expect(again.jobId).toBe(first.jobId)
  })
})
