import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { AvatarGrantSchema, FEATURES_HEADER, PetSchema } from '@lapka/contracts'
import { DELETE as deletePet, GET as getPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { DELETE as removeAvatar, POST as grantAvatar, PUT as confirmAvatar } from '@/app/(backend)/api/v1/pets/[id]/avatar/route'
import { AVATAR_BUCKET, sweepAvatars } from '@/server/pets/avatar-service'
import { removeUserPhotos } from '@/server/uploads/photo-storage'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures } from './fixtures'

/** FB-4: a pet's photo, written straight to private storage and kept until replaced. */

let db: Client
let ownerAId: string
let tokenA: string
let tokenB: string

const service = () =>
  createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

// 1600×1200, as in check-jobs-photos.test.ts.
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40,
  0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
])

function request(token: string, method: string, body?: unknown) {
  return new NextRequest('http://test.local/api/v1/pets', {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      [FEATURES_HEADER]: 'pet-dates,pet-avatar',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

/** Asks for a grant and writes the bytes, as the phone does; returns the path. */
async function upload(token: string, petId: string, bytes: Uint8Array = JPEG): Promise<string> {
  const granted = await grantAvatar(request(token, 'POST', { content_type: 'image/jpeg', size_bytes: bytes.byteLength }), params(petId))
  expect(granted.status).toBe(201)
  const grant = AvatarGrantSchema.parse(await granted.json())
  const put = await fetch(grant.url, { method: 'PUT', headers: grant.headers, body: bytes as Uint8Array<ArrayBuffer> })
  expect(put.ok).toBe(true)
  return grant.path
}

async function objectExists(path: string): Promise<boolean> {
  const [folder, ...rest] = path.split('/')
  const { data } = await service().storage.from(AVATAR_BUCKET).list(`${folder}/${rest.slice(0, -1).join('/')}`)
  return (data ?? []).some((object) => object.name === rest[rest.length - 1])
}

beforeAll(async () => {
  db = await connect()
  ownerAId = (await seedFixtures(db)).ownerAId
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

afterAll(async () => {
  await db?.end()
})

describe('a pet’s photo (FB-4)', () => {
  it('is uploaded, confirmed and read back through a signed link', async () => {
    const path = await upload(tokenA, PET_IDS.aCat)
    const confirmed = await confirmAvatar(request(tokenA, 'PUT', { path }), params(PET_IDS.aCat))
    expect(confirmed.status).toBe(200)

    const pet = PetSchema.parse(await (await getPet(request(tokenA, 'GET'), params(PET_IDS.aCat))).json())
    expect(pet.avatar_url).toMatch(/^http.*pet-avatars/)
    const image = await fetch(pet.avatar_url!)
    expect(image.ok).toBe(true)
  })

  it('refuses a path that is not the caller’s pet', async () => {
    const path = await upload(tokenA, PET_IDS.aCat)
    expect((await confirmAvatar(request(tokenB, 'PUT', { path }), params(PET_IDS.bCat))).status).toBe(404)
    expect((await confirmAvatar(request(tokenA, 'PUT', { path }), params(PET_IDS.aDog))).status).toBe(404)
  })

  it('refuses a file that is not a picture, and removes it', async () => {
    const path = await upload(tokenA, PET_IDS.aCat, new TextEncoder().encode('not a picture at all'))
    expect((await confirmAvatar(request(tokenA, 'PUT', { path }), params(PET_IDS.aCat))).status).toBe(415)
    expect(await objectExists(path)).toBe(false)
  })

  it('removes the old object when the photo is replaced, and both on «убрать»', async () => {
    const first = await upload(tokenA, PET_IDS.aCat)
    await confirmAvatar(request(tokenA, 'PUT', { path: first }), params(PET_IDS.aCat))
    const second = await upload(tokenA, PET_IDS.aCat)
    await confirmAvatar(request(tokenA, 'PUT', { path: second }), params(PET_IDS.aCat))
    expect(await objectExists(first)).toBe(false)
    expect(await objectExists(second)).toBe(true)

    const removed = await removeAvatar(request(tokenA, 'DELETE'), params(PET_IDS.aCat))
    expect(removed.status).toBe(200)
    expect(PetSchema.parse(await removed.json()).avatar_url).toBeNull()
    expect(await objectExists(second)).toBe(false)
  })

  it('is not sent to a client that does not ask for it', async () => {
    const path = await upload(tokenA, PET_IDS.aCat)
    await confirmAvatar(request(tokenA, 'PUT', { path }), params(PET_IDS.aCat))
    const older = new NextRequest('http://test.local/api/v1/pets', { headers: { authorization: `Bearer ${tokenA}` } })
    expect(await (await getPet(older, params(PET_IDS.aCat))).json()).not.toHaveProperty('avatar_url')
  })

  it('sweeps an upload never confirmed, and keeps the one a pet shows', async () => {
    const kept = await upload(tokenA, PET_IDS.aCat)
    await confirmAvatar(request(tokenA, 'PUT', { path: kept }), params(PET_IDS.aCat))
    const abandoned = await upload(tokenA, PET_IDS.aCat)
    await sweepAvatars(service() as never, new Date(Date.now() + 4 * 60 * 60 * 1000))
    expect(await objectExists(abandoned)).toBe(false)
    expect(await objectExists(kept)).toBe(true)
  })

  it('goes with its pet, and with the account', async () => {
    const path = await upload(tokenA, PET_IDS.aDog)
    await confirmAvatar(request(tokenA, 'PUT', { path }), params(PET_IDS.aDog))
    expect((await deletePet(request(tokenA, 'DELETE'), params(PET_IDS.aDog))).status).toBe(204)
    expect(await objectExists(path)).toBe(false)

    const other = await upload(tokenA, PET_IDS.aCat)
    await confirmAvatar(request(tokenA, 'PUT', { path: other }), params(PET_IDS.aCat))
    await removeUserPhotos(service() as never, ownerAId)
    expect(await objectExists(other)).toBe(false)
  })
})
