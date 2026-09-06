import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/(backend)/api/symptom-check/route'
import { handleSymptomCheckRequest } from '@/server/symptom-check/symptom-check-http'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'

vi.mock('@/server/symptom-check/symptom-check-http', () => ({
  handleSymptomCheckRequest: vi.fn(),
}))

describe('symptom-check API route', () => {
  beforeEach(() => {
    vi.mocked(handleSymptomCheckRequest).mockReset()
  })

  it('delegates POST requests to the symptom-check request handler', async () => {
    const expected = Response.json({ ok: true })
    vi.mocked(handleSymptomCheckRequest).mockResolvedValue(expected as never)
    const token = 'test-csrf-token'
    const request = new NextRequest('http://test.local/api/symptom-check', {
      method: 'POST',
      headers: {
        origin: 'http://test.local',
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        [CSRF_HEADER_NAME]: token,
      },
    })

    const response = await POST(request as never)

    expect(response).toBe(expected)
    expect(handleSymptomCheckRequest).toHaveBeenCalledWith(request)
  })

  it('returns 403 before delegating when CSRF token is missing', async () => {
    const response = await POST(new NextRequest('http://test.local/api/symptom-check', { method: 'POST' }))

    expect(response.status).toBe(403)
    expect(handleSymptomCheckRequest).not.toHaveBeenCalled()
  })
})
