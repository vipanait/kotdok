import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/server/supabase/server'
import { loadAdminUser } from '@/server/auth/admin-user'

vi.mock('@/server/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

const user: User = {
  id: 'user-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
}

function profileReturning(profile: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
    }),
  }
}

// The decision is the service's; turning it into a redirect is the page's job,
// so this suite asserts the decision and never imports next/navigation.
describe('loadAdminUser', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(createServiceClient).mockReset()
  })

  it('reports a signed-out visitor without reading the profile', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)

    await expect(loadAdminUser()).resolves.toEqual({ ok: false, reason: 'signed_out' })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('reports a signed-in non-admin', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    } as never)
    vi.mocked(createServiceClient).mockReturnValue(
      profileReturning({ id: user.id, role: 'user' }) as never,
    )

    await expect(loadAdminUser()).resolves.toEqual({ ok: false, reason: 'not_admin' })
  })

  it('returns context for admins', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    } as never)
    vi.mocked(createServiceClient).mockReturnValue(
      profileReturning({ id: user.id, role: 'admin' }) as never,
    )

    await expect(loadAdminUser()).resolves.toEqual({
      ok: true,
      user,
      profile: { id: user.id, role: 'admin' },
    })
  })
})
