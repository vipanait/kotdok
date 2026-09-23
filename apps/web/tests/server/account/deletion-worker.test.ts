import { describe, expect, it, vi } from 'vitest'
import { processDeletionJob, type DeletionWorkerDeps } from '@/server/account/deletion-worker'

const USER = '11111111-1111-4111-8111-000000000abc'

function deps(overrides: Partial<DeletionWorkerDeps> = {}): DeletionWorkerDeps {
  return {
    claim: vi.fn(async () => ({})),
    deletePhotos: vi.fn(async () => {}),
    deleteAccountData: vi.fn(async () => {}),
    deleteAuthUser: vi.fn(async () => 'deleted' as const),
    markStep: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => 'in_progress' as const),
    log: vi.fn(),
    ...overrides,
  }
}

describe('processing a deletion job', () => {
  it('runs photos, then data, then Auth, then completes, marking each step', async () => {
    const d = deps()
    const order: string[] = []
    d.deletePhotos = vi.fn(async () => void order.push('photos'))
    d.deleteAccountData = vi.fn(async () => void order.push('data'))
    d.deleteAuthUser = vi.fn(async () => (order.push('auth'), 'deleted' as const))
    d.markStep = vi.fn(async (_user, step) => void order.push(`mark:${step}`))
    d.complete = vi.fn(async () => void order.push('complete'))

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(order).toEqual([
      'photos',
      'mark:photos',
      'data',
      'mark:data',
      'auth',
      'mark:auth',
      'complete',
    ])
  })

  it('does not repeat the photos step once it is recorded', async () => {
    const d = deps({ claim: vi.fn(async () => ({ photos: '2026-09-23T10:00:00Z' })) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(d.deletePhotos).not.toHaveBeenCalled()
    expect(d.deleteAccountData).toHaveBeenCalledWith(USER)
  })

  it('counts a Storage failure against the job and goes no further', async () => {
    const d = deps({ deletePhotos: vi.fn(async () => { throw new Error('storage down') }) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('retry')
    expect(d.recordFailure).toHaveBeenCalledWith(USER, 'photos_step_failed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('does nothing when the job cannot be claimed', async () => {
    const d = deps({ claim: vi.fn(async () => null) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('not_claimed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.recordFailure).not.toHaveBeenCalled()
  })

  it('treats a claim that throws as not claimed, logging and doing nothing else', async () => {
    const d = deps({ claim: vi.fn(async () => { throw new Error('database down') }) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('not_claimed')
    expect(d.log).toHaveBeenCalledWith('claim_failed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.recordFailure).not.toHaveBeenCalled()
  })

  it('resumes after the data step without running it again', async () => {
    const d = deps({ claim: vi.fn(async () => ({ data: '2026-09-17T10:00:00Z' })) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.deleteAuthUser).toHaveBeenCalledWith(USER)
  })

  it('only completes when both steps are already done', async () => {
    const d = deps({ claim: vi.fn(async () => ({ data: 'x', auth: 'y' })) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.deleteAuthUser).not.toHaveBeenCalled()
    expect(d.complete).toHaveBeenCalledWith(USER)
  })

  it('treats an Auth user that is already gone as done', async () => {
    const d = deps({ deleteAuthUser: vi.fn(async () => 'absent' as const) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(d.markStep).toHaveBeenCalledWith(USER, 'auth')
  })

  it.each([
    ['deleteAccountData', 'data_step_failed'],
    ['deleteAuthUser', 'auth_step_failed'],
    ['complete', 'complete_step_failed'],
  ] as const)('records a failure of %s as %s and stops there', async (step, code) => {
    const d = deps({ [step]: vi.fn(async () => { throw new Error('user 42 secret detail') }) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('retry')
    expect(d.recordFailure).toHaveBeenCalledWith(USER, code)
    expect(d.log).toHaveBeenCalledWith(code)
    if (step === 'deleteAccountData') expect(d.deleteAuthUser).not.toHaveBeenCalled()
    if (step !== 'complete') expect(d.complete).not.toHaveBeenCalled()
  })

  it('reports that a person is needed once the attempts run out', async () => {
    const d = deps({
      deleteAuthUser: vi.fn(async () => { throw new Error('down') }),
      recordFailure: vi.fn(async () => 'action_required' as const),
    })

    await expect(processDeletionJob(d, USER)).resolves.toBe('action_required')
  })

  it('never marks a step that failed', async () => {
    const d = deps({ deleteAccountData: vi.fn(async () => { throw new Error('boom') }) })

    await processDeletionJob(d, USER)

    // The photos step before it did finish, and is recorded; the failed one is not.
    expect(d.markStep).not.toHaveBeenCalledWith(USER, 'data')
    expect(d.markStep).not.toHaveBeenCalledWith(USER, 'auth')
  })

  it('never logs the user id or the error text', async () => {
    const log = vi.fn()
    const d = deps({ log, deleteAuthUser: vi.fn(async () => { throw new Error(`no user ${USER}`) }) })

    await processDeletionJob(d, USER)

    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(USER)
      expect(JSON.stringify(call)).not.toContain('no user')
    }
  })

  it('still resolves to retry when recording the failure fails too', async () => {
    const log = vi.fn()
    const d = deps({
      log,
      deleteAccountData: vi.fn(async () => { throw new Error('data delete failed') }),
      recordFailure: vi.fn(async () => { throw new Error('database down') }),
    })

    await expect(processDeletionJob(d, USER)).resolves.toBe('retry')
    expect(d.log).toHaveBeenCalledWith('data_step_failed')
  })
})
