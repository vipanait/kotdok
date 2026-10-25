import { describe, expect, it } from 'vitest'
import { ApiContractError, ApiError, ApiTimeoutError } from './api-client'
import { apiFailure } from './api-failure'

/**
 * One reading of a failed call for every screen of both apps: the site's
 * `classifyFailure`, `saveFailure`, `eventSaveFailure`, `submitFailure` and
 * the phone's `weightSaveFailure`, `failureKind`, `isOffline` were the same
 * switch written six times.
 */
const api = (code: string, details?: unknown) => new ApiError(code, 400, 'm', 'r', details)

describe('apiFailure', () => {
  it('reads the server’s refusals by their code', () => {
    expect(apiFailure(api('unauthorized'))).toBe('signedOut')
    expect(apiFailure(api('account_deleting'))).toBe('deleting')
    expect(apiFailure(api('not_found'))).toBe('gone')
    expect(apiFailure(api('bad_request'))).toBe('rejected')
    expect(apiFailure(api('record_done'))).toBe('recordDone')
    expect(apiFailure(api('rate_limited'))).toBe('rateLimited')
    expect(apiFailure(api('insufficient_credits'))).toBe('noCredits')
    expect(apiFailure(api('reauth_required'))).toBe('reauthRequired')
    expect(apiFailure(api('internal_error'))).toBe('failed')
    expect(apiFailure(api('something_new'))).toBe('failed')
  })

  it('tells a reused key apart from any other conflict', () => {
    expect(apiFailure(api('conflict', { reason: 'idempotency_key_reused' }))).toBe('keyReused')
    expect(apiFailure(api('conflict'))).toBe('conflict')
  })

  it('reads no answer as offline, and a wrong answer as a failure', () => {
    expect(apiFailure(new TypeError('Failed to fetch'))).toBe('offline')
    expect(apiFailure(new ApiTimeoutError('/pets', 30_000))).toBe('offline')
    expect(apiFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe('offline')
    expect(apiFailure(new ApiContractError('/pets', []))).toBe('failed')
    expect(apiFailure(new Error('anything'))).toBe('failed')
  })
})
