import { describe, expect, it, vi } from 'vitest'
import { ApiError, ApiTimeoutError } from '@lapka/shared'
import {
  CheckJobFailed,
  checkCreateBody,
  keySpent,
  submitFailure,
  waitForCheck,
} from '@/features/symptom-check/check-submit'

/**
 * The site's check goes the way the phone's does: POST /checks is accepted
 * as a job, the job is polled until the check exists, and only then does
 * the result page open. What the server refuses is said in the form's own
 * words; what never answers is a retry with the same key.
 */
describe('checkCreateBody', () => {
  it('sends what was filled in, and nothing for an empty choice', () => {
    expect(
      checkCreateBody({ petId: 'pet-1', symptoms: ' вялый ', appetite: 'reduced', activity: '', duration: '', stool: '', painSigns: ['limping'] }, null),
    ).toEqual({ pet_id: 'pet-1', symptoms: ' вялый ', upload_ids: [], appetite: 'reduced', activity: null, duration: null, stool: null, pain_signs: ['limping'] })
  })

  it('names the case of a re-check', () => {
    const body = checkCreateBody({ petId: 'pet-1', symptoms: 'x', appetite: '', activity: '', duration: '', stool: '', painSigns: [] }, 'case-1')
    expect(body.followup_case_id).toBe('case-1')
  })
})

describe('waitForCheck', () => {
  const job = (status: 'queued' | 'processing' | 'completed' | 'failed', extra: Record<string, unknown> = {}) => ({
    job_id: 'job-1', status, check_id: null, error_code: null, created_at: '', updated_at: '', ...extra,
  })

  it('polls until the check exists and answers its id', async () => {
    const getJob = vi.fn().mockResolvedValueOnce(job('processing')).mockResolvedValueOnce(job('completed', { check_id: 'check-9' }))
    const sleep = vi.fn().mockResolvedValue(undefined)
    await expect(waitForCheck('job-1', { getJob, sleep, pollMs: 10, giveUpMs: 1000 })).resolves.toBe('check-9')
    expect(getJob).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(10)
  })

  it('throws with the server’s reason when the job failed', async () => {
    const getJob = vi.fn().mockResolvedValue(job('failed', { error_code: 'insufficient_credits' }))
    await expect(waitForCheck('job-1', { getJob, sleep: async () => {}, pollMs: 10, giveUpMs: 1000 })).rejects.toBeInstanceOf(CheckJobFailed)
    await expect(waitForCheck('job-1', { getJob, sleep: async () => {}, pollMs: 10, giveUpMs: 1000 })).rejects.toMatchObject({ code: 'insufficient_credits' })
  })

  it('gives up after the deadline', async () => {
    let clock = 0
    const getJob = vi.fn().mockResolvedValue(job('processing'))
    const sleep = async (ms: number) => {
      clock += ms
    }
    await expect(waitForCheck('job-1', { getJob, sleep, pollMs: 500, giveUpMs: 1200, now: () => clock })).rejects.toMatchObject({ code: 'timeout' })
    expect(getJob.mock.calls.length).toBeLessThanOrEqual(4)
  })
})

describe('submitFailure', () => {
  const api = (code: string, requestId: string | null = 'r') => new ApiError(code, 400, 'm', requestId)

  it('maps the server’s refusals to the form’s states', () => {
    expect(submitFailure(api('unauthorized'), false)).toBe('signedOut')
    expect(submitFailure(api('insufficient_credits'), false)).toBe('noCredits')
    expect(submitFailure(api('bad_request'), false)).toBe('invalid')
    expect(submitFailure(api('not_found'), false)).toBe('petMissing')
    expect(submitFailure(api('rate_limited'), false)).toBe('busy')
    expect(submitFailure(api('conflict'), true)).toBe('recheckRefused')
    expect(submitFailure(api('conflict'), false)).toBe('failed')
    expect(submitFailure(api('internal_error'), false)).toBe('failed')
  })

  it('tells a failed analysis apart from a lost answer', () => {
    expect(submitFailure(new CheckJobFailed('insufficient_credits'), false)).toBe('noCredits')
    expect(submitFailure(new CheckJobFailed('internal_error'), false)).toBe('failed')
    expect(submitFailure(new TypeError('Failed to fetch'), false)).toBe('offline')
    expect(submitFailure(new ApiTimeoutError('/checks', 30_000), false)).toBe('offline')
  })

  it('spends the key on an answer from the server, keeps it on no answer', () => {
    expect(keySpent(api('bad_request'))).toBe(true)
    expect(keySpent(new CheckJobFailed('internal_error'))).toBe(true)
    expect(keySpent(new TypeError('Failed to fetch'))).toBe(false)
    expect(keySpent(new ApiTimeoutError('/checks', 30_000))).toBe(false)
  })
})
