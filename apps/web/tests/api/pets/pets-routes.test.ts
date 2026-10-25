import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { POST as createPetRoute } from '@/app/(backend)/api/pets/route'
import { DELETE as deletePetRoute, PUT as updatePetRoute } from '@/app/(backend)/api/pets/[id]/route'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
import { createPet, softDeletePetAndChecks, updatePet } from '@/server/pets/pet-service'
import { owesConsent } from '@/server/consent/consent-service'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'

vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/server/consent/consent-service', () => ({ owesConsent: vi.fn() }))
vi.mock('@/server/pets/pet-service', () => ({
  createPet: vi.fn(),
  softDeletePetAndChecks: vi.fn(),
  updatePet: vi.fn(),
}))

const user: User = {
  id: 'user-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
}
const serviceClient = { service: true }
const csrfToken = 'test-csrf-token'

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonRequest(body: unknown) {
  return new NextRequest('http://test.local', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://test.local',
      cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
      [CSRF_HEADER_NAME]: csrfToken,
    },
    body: JSON.stringify(body),
  })
}

function csrfRequest(method: string) {
  return new NextRequest('http://test.local', {
    method,
    headers: {
      origin: 'http://test.local',
      cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
      [CSRF_HEADER_NAME]: csrfToken,
    },
  })
}

describe('pets API routes', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(user)
    vi.mocked(createServiceClient).mockReturnValue(serviceClient as never)
    vi.mocked(owesConsent).mockResolvedValue(false)
    vi.mocked(createPet).mockReset()
    vi.mocked(softDeletePetAndChecks).mockReset()
    vi.mocked(updatePet).mockReset()
  })

  it('returns 401 for an unauthenticated create', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await createPetRoute(jsonRequest({ species: 'cat', name: 'Мурка' }))

    expect(response.status).toBe(401)
    expect(createPet).not.toHaveBeenCalled()
  })

  it('refuses an account that still owes consent', async () => {
    vi.mocked(owesConsent).mockResolvedValue(true)

    const response = await createPetRoute(jsonRequest({ species: 'cat', name: 'Мурка' }))

    expect(response.status).toBe(403)
    expect(createPet).not.toHaveBeenCalled()
  })

  it('creates a pet for the authenticated user', async () => {
    vi.mocked(createPet).mockResolvedValue({ ok: true, data: { id: 'pet-2', name: 'Мурка' } } as never)

    const response = await createPetRoute(jsonRequest({ name: 'Мурка', species: 'cat' }))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'pet-2', name: 'Мурка' })
    expect(createPet).toHaveBeenCalledWith(serviceClient, user.id, { name: 'Мурка', species: 'cat' })
  })

  it('updates a pet owned by the authenticated user', async () => {
    vi.mocked(updatePet).mockResolvedValue({ ok: true, data: { id: 'pet-1', name: 'Барсик' } } as never)

    const response = await updatePetRoute(jsonRequest({ name: 'Барсик' }), params('pet-1'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'pet-1', name: 'Барсик' })
    expect(updatePet).toHaveBeenCalledWith(serviceClient, user.id, 'pet-1', { name: 'Барсик' })
  })

  it('returns 404 when updating a missing pet', async () => {
    vi.mocked(updatePet).mockResolvedValue({ ok: false, reason: 'not_found' } as never)

    const response = await updatePetRoute(jsonRequest({ name: 'Барсик' }), params('missing'))

    expect(response.status).toBe(404)
  })

  it('refuses a birth or home day ahead of every time zone on create and update, as /api/v1 does', async () => {
    const ahead = '2999-01-01'
    for (const body of [{ name: 'Мурка', species: 'cat', birth_date: ahead }, { name: 'Мурка', species: 'cat', adopted_on: ahead }]) {
      expect((await createPetRoute(jsonRequest(body))).status).toBe(400)
      expect((await updatePetRoute(jsonRequest({ birth_date: body.birth_date ?? null, adopted_on: body.adopted_on ?? null }), params('pet-1'))).status).toBe(400)
    }
    expect(createPet).not.toHaveBeenCalled()
    expect(updatePet).not.toHaveBeenCalled()
  })

  it('takes a past birth and home day', async () => {
    vi.mocked(createPet).mockResolvedValue({ ok: true, data: { id: 'pet-2' } } as never)
    vi.mocked(updatePet).mockResolvedValue({ ok: true, data: { id: 'pet-1' } } as never)
    const body = { name: 'Мурка', species: 'cat', birth_date: '2020-06-15', adopted_on: '2021-01-10' }
    expect((await createPetRoute(jsonRequest(body))).status).toBe(201)
    expect((await updatePetRoute(jsonRequest({ birth_date: '2020-06-15', adopted_on: '2021-01-10' }), params('pet-1'))).status).toBe(200)
  })

  it('soft-deletes a pet for the authenticated user', async () => {
    vi.mocked(softDeletePetAndChecks).mockResolvedValue({ ok: true, data: { id: 'pet-1' } } as never)

    const response = await deletePetRoute(csrfRequest('DELETE'), params('pet-1'))

    expect(response.status).toBe(204)
    expect(softDeletePetAndChecks).toHaveBeenCalledWith(serviceClient, user.id, 'pet-1')
  })
})
