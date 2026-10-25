import { describe, expect, it } from 'vitest'
import { GIVE_UP_AFTER_MS, POLL_EVERY_MS, jobStep, recoveryFor } from './check-job'

const CHECK = '11111111-1111-4111-8111-000000000001'

describe('reading one answer about the analysis job', () => {
  it('opens the result once the job is done and names its check', () => {
    expect(jobStep({ status: 'completed', check_id: CHECK, error_code: null })).toEqual({ kind: 'ready', checkId: CHECK })
  })

  it('keeps asking while a done job has not yet stored its check', () => {
    // The check id comes with the stored result; done without it is not ready to open.
    expect(jobStep({ status: 'completed', check_id: null, error_code: null })).toEqual({ kind: 'running' })
  })

  it('keeps asking while the job is queued or running', () => {
    expect(jobStep({ status: 'queued', check_id: null, error_code: null })).toEqual({ kind: 'running' })
    expect(jobStep({ status: 'processing', check_id: null, error_code: null })).toEqual({ kind: 'running' })
  })

  it('tells an empty balance from any other failure', () => {
    expect(jobStep({ status: 'failed', check_id: null, error_code: 'insufficient_credits' })).toEqual({
      kind: 'failed',
      reason: 'insufficient_credits',
    })
    expect(jobStep({ status: 'failed', check_id: null, error_code: 'dependency_unavailable' })).toEqual({
      kind: 'failed',
      reason: 'analysis_failed',
    })
    expect(jobStep({ status: 'failed', check_id: null, error_code: null })).toEqual({
      kind: 'failed',
      reason: 'analysis_failed',
    })
  })

  it('asks every second and a half, and gives up after three minutes', () => {
    expect(POLL_EVERY_MS).toBe(1500)
    expect(GIVE_UP_AFTER_MS).toBe(180_000)
  })
})

describe('the way out of a failed check', () => {
  it('is a request for an empty balance, the history for a slow answer, another try otherwise', () => {
    expect(recoveryFor('insufficient_credits')).toBe('request')
    expect(recoveryFor('still_running')).toBe('history')
    expect(recoveryFor('analysis_failed')).toBe('retry')
    expect(recoveryFor(null)).toBe('retry')
  })
})
