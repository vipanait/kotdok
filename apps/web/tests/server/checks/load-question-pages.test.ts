import { describe, expect, it, vi } from 'vitest'

// CQ-02 criterion 23: a thread that cannot be read leaves the result page standing.

const service = vi.hoisted(() => ({ getQuestionThread: vi.fn() }))
vi.mock('@/server/check-questions/check-question-service', () => service)
vi.mock('@/server/supabase/server', () => ({ createServiceClient: () => ({}) }))

describe('loadResultQuestions', () => {
  it('is null when the read fails or throws, so the page renders without the block', async () => {
    const { loadResultQuestions } = await import('@/server/checks/load-question-pages')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    service.getQuestionThread.mockResolvedValueOnce({ ok: false, reason: 'storage_error' })
    expect(await loadResultQuestions('user', 'check')).toBeNull()
    service.getQuestionThread.mockRejectedValueOnce(new Error('database down'))
    expect(await loadResultQuestions('user', 'check')).toBeNull()
  })

  it('passes the thread through when it is read', async () => {
    const { loadResultQuestions } = await import('@/server/checks/load-question-pages')
    const thread = { items: [], limit: 3, remaining: 3, open_until: '2026-11-15T00:00:00.000Z', closed: null }
    service.getQuestionThread.mockResolvedValueOnce({ ok: true, data: thread })
    expect(await loadResultQuestions('user', 'check')).toEqual(thread)
  })
})
