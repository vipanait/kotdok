import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/server/supabase/server'
import { requireAdminUser } from '@/server/auth/require-admin-user'

vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => {
  throw new Error(`redirect:${path}`)
}) }))
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

describe('requireAdminUser', () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear()
    vi.mocked(createClient).mockReset()
    vi.mocked(createServiceClient).mockReset()
  })

  it('redirects anonymous users to login with next path', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)

    await expect(requireAdminUser('/admin/statistics?days=7')).rejects.toThrow(
      'redirect:/login?next=%2Fadmin%2Fstatistics%3Fdays%3D7',
    )
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('redirects regular users to dashboard', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    } as never)
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: user.id, role: 'user' },
          error: null,
        }),
      }),
    } as never)

    await expect(requireAdminUser()).rejects.toThrow('redirect:/dashboard')
  })

  it('returns context for admins', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    } as never)
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: user.id, role: 'admin' },
          error: null,
        }),
      }),
    } as never)

    await expect(requireAdminUser()).resolves.toEqual({
      user,
      profile: { id: user.id, role: 'admin' },
    })
  })
})
