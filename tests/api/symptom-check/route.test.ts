import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/(backend)/api/symptom-check/route'
import { handleSymptomCheckRequest } from '@/server/symptom-check/symptom-check-service'

vi.mock('@/server/symptom-check/symptom-check-service', () => ({
  handleSymptomCheckRequest: vi.fn(),
}))

describe('symptom-check API route', () => {
  beforeEach(() => {
    vi.mocked(handleSymptomCheckRequest).mockReset()
  })

  it('delegates POST requests to the symptom-check request handler', async () => {
    const expected = Response.json({ ok: true })
    vi.mocked(handleSymptomCheckRequest).mockResolvedValue(expected as never)
    const request = new Request('http://test.local/api/symptom-check', { method: 'POST' })

    const response = await POST(request as never)

    expect(response).toBe(expected)
    expect(handleSymptomCheckRequest).toHaveBeenCalledWith(request)
  })
})
