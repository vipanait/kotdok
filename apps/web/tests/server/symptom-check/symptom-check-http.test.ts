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
    vi.mocked(createServiceClient).mockReturnValue({ from } as never)

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
})
