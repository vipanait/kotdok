import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
import { handleSymptomCheckRequest } from '@/server/symptom-check/symptom-check-http'

vi.mock('openai', () => ({
  default: vi.fn(function OpenAI() {
    return {}
  }),
}))
vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn() }))

const user: User = {
  id: 'user-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
}

function jsonRequest(body: unknown) {
  return new Request('http://test.local/api/symptom-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function multipartRequest(fields: Record<string, string>) {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.append(name, value)
  return new Request('http://test.local/api/symptom-check', { method: 'POST', body })
}

function singleResult(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  return builder
}

describe('symptom-check HTTP adapter', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockReset()
    vi.mocked(createServiceClient).mockReset()
  })

  it('returns 401 before touching Supabase when no user is authenticated', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await handleSymptomCheckRequest(jsonRequest({ symptoms: 'coughing' }) as never)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 when the requested pet does not belong to the user', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(user)
    const profileQuery = singleResult({
      data: { id: user.id, status: 'active', role: 'user', locale: 'ru', credits: 1 },
      error: null,
    })
    const petQuery = singleResult({ data: null, error: null })
    const from = vi.fn((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'pets') return petQuery
      throw new Error(`Unexpected table: ${table}`)
    })
    // The limiter runs before the pet lookup; an allowed verdict keeps it out
    // of the way of what this test is about.
    const rpc = vi.fn(async () => ({
      data: { allowed: true, remaining: 9, reset_at: '2026-09-06T13:00:00.000Z' },
      error: null,
    }))
    vi.mocked(createServiceClient).mockReturnValue({ from, rpc } as never)

    const response = await handleSymptomCheckRequest(jsonRequest({
      symptoms: 'sneezing a lot',
      pet_id: 'pet-from-another-user',
    }) as never)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Pet not found / Питомец не найден.' })
    expect(petQuery.eq).toHaveBeenCalledWith('id', 'pet-from-another-user')
    expect(petQuery.eq).toHaveBeenCalledWith('user_id', user.id)
    expect(petQuery.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('refuses a multipart body: photo upload is off until uploads move to storage', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(user)
    const from = vi.fn(() => {
      throw new Error('The analysis must not start for a multipart request')
    })
    vi.mocked(createServiceClient).mockReturnValue({ from, rpc: vi.fn() } as never)

    const response = await handleSymptomCheckRequest(
      multipartRequest({ symptoms: 'limping since morning' }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Загрузка фото временно отключена — опишите симптомы текстом',
    })
    expect(from).not.toHaveBeenCalled()
  })
})
