import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/(backend)/api/credits/request-extra/route'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { submitExtraCheckRequest } from '@/server/extra-check/extra-check-service'

vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/extra-check/extra-check-service', () => ({
  submitExtraCheckRequest: vi.fn(),
}))

describe('credits/request-extra route', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockReset()
    vi.mocked(submitExtraCheckRequest).mockReset()
  })

  it('returns 401 for unauthorized user', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 200 and request id when request is created', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(submitExtraCheckRequest).mockResolvedValue({ requestId: 'req-10' })

    const response = await POST()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'pending',
      request_id: 'req-10',
    })
  })

  it('returns 409 for existing pending request', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(submitExtraCheckRequest).mockRejectedValue(new Error('pending_request_exists'))

    const response = await POST()

    expect(response.status).toBe(409)
  })
})
