import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { GET as listCatsRoute, POST as createCatRoute } from '@/app/(backend)/api/cats/route'
import { DELETE as deleteCatRoute, PUT as updateCatRoute } from '@/app/(backend)/api/cats/[id]/route'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
import { createCat, listCats, softDeleteCatAndChecks, updateCat } from '@/server/cats/cat-service'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'

vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/server/cats/cat-service', () => ({
  createCat: vi.fn(),
  listCats: vi.fn(),
  softDeleteCatAndChecks: vi.fn(),
  updateCat: vi.fn(),
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

describe('cats API routes', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(user)
    vi.mocked(createServiceClient).mockReturnValue(serviceClient as never)
    vi.mocked(createCat).mockReset()
    vi.mocked(listCats).mockReset()
    vi.mocked(softDeleteCatAndChecks).mockReset()
    vi.mocked(updateCat).mockReset()
  })

  it('returns 401 for unauthenticated cat lists', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await listCatsRoute()

    expect(response.status).toBe(401)
    expect(listCats).not.toHaveBeenCalled()
  })

  it('scopes cat lists by authenticated user id', async () => {
    vi.mocked(listCats).mockResolvedValue({ data: [{ id: 'cat-1' }], error: null } as never)

    const response = await listCatsRoute()

    expect(response.status).toBe(200)
    expect(listCats).toHaveBeenCalledWith(serviceClient, user.id)
    await expect(response.json()).resolves.toEqual([{ id: 'cat-1' }])
  })

  it('scopes cat creation by authenticated user id', async () => {
    const body = { name: 'Барсик' }
    vi.mocked(createCat).mockResolvedValue({ data: { id: 'cat-1', ...body }, error: null } as never)

    const response = await createCatRoute(jsonRequest(body) as never)

    expect(response.status).toBe(201)
    expect(createCat).toHaveBeenCalledWith(serviceClient, user.id, body)
    await expect(response.json()).resolves.toMatchObject({ id: 'cat-1' })
  })

  it('returns 403 for cat creation without CSRF token', async () => {
    const response = await createCatRoute(new NextRequest('http://test.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Барсик' }),
    }) as never)

    expect(response.status).toBe(403)
    expect(createCat).not.toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated cat updates', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await updateCatRoute(jsonRequest({ name: 'New name' }) as never, params('cat-1'))

    expect(response.status).toBe(401)
    expect(updateCat).not.toHaveBeenCalled()
  })

  it('scopes cat updates by authenticated user id and cat id', async () => {
    const body = { name: 'New name' }
    vi.mocked(updateCat).mockResolvedValue({ data: { id: 'cat-1', ...body }, error: null } as never)

    const response = await updateCatRoute(jsonRequest(body) as never, params('cat-1'))

    expect(response.status).toBe(200)
    expect(updateCat).toHaveBeenCalledWith(serviceClient, user.id, 'cat-1', body)
    await expect(response.json()).resolves.toMatchObject({ id: 'cat-1' })
  })

  it('returns 404 when scoped cat update finds no row', async () => {
    vi.mocked(updateCat).mockResolvedValue({ data: null, error: null } as never)

    const response = await updateCatRoute(jsonRequest({ name: 'New name' }) as never, params('missing-cat'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('scopes cat deletion by authenticated user id and cat id', async () => {
    vi.mocked(softDeleteCatAndChecks).mockResolvedValue({ data: { id: 'cat-1' }, error: null } as never)

    const response = await deleteCatRoute(csrfRequest('DELETE') as never, params('cat-1'))

    expect(response.status).toBe(204)
    expect(softDeleteCatAndChecks).toHaveBeenCalledWith(serviceClient, user.id, 'cat-1')
  })

  it('returns 404 when scoped cat deletion finds no row', async () => {
    vi.mocked(softDeleteCatAndChecks).mockResolvedValue({ data: null, error: null } as never)

    const response = await deleteCatRoute(csrfRequest('DELETE') as never, params('missing-cat'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })
})
