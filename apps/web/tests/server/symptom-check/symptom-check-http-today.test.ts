import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { analyzeSymptomCheck } from '@/server/symptom-check/analyze-symptom-check'
import { handleSymptomCheckRequest } from '@/server/symptom-check/symptom-check-http'
import { utcToday } from '@/server/medical-record/weight-service'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/auth/get-auth-user', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn(() => ({})) }))
vi.mock('@/server/consent/consent-service', () => ({ owesConsent: vi.fn(async () => false) }))
vi.mock('@/server/symptom-check/analyze-symptom-check', () => ({
  analyzeSymptomCheck: vi.fn(async () => ({ ok: false, code: 'dependency_unavailable', message: 'not here' })),
}))

function send(body: Record<string, unknown>) {
  return handleSymptomCheckRequest(
    new Request('http://test.local/api/symptom-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symptoms: 'Не ест второй день', ...body }),
    }) as never,
  )
}

const dayFrom = (offset: number) => utcToday(new Date(Date.now() + offset * 86_400_000))

describe('the site’s check form: the owner’s day the record is read on (MW-09)', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(analyzeSymptomCheck).mockClear()
  })

  it('passes the day the browser sent, inside the window around the server’s', async () => {
    await send({ today: dayFrom(1) })
    expect(vi.mocked(analyzeSymptomCheck).mock.calls[0][1].today).toBe(dayFrom(1))
  })

  it('takes the server’s UTC day without one, or with one outside the window', async () => {
    await send({})
    await send({ today: dayFrom(5) })
    await send({ today: 'soon' })
    expect(vi.mocked(analyzeSymptomCheck).mock.calls.map((call) => call[1].today)).toEqual([utcToday(), utcToday(), utcToday()])
  })
})
