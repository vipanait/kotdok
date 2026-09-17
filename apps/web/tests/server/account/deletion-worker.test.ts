import { describe, expect, it, vi } from 'vitest'
import { processDeletionJob, type DeletionWorkerDeps } from '@/server/account/deletion-worker'

const USER = '11111111-1111-4111-8111-000000000abc'

function deps(overrides: Partial<DeletionWorkerDeps> = {}): DeletionWorkerDeps {
  return {
    claim: vi.fn(async () => ({})),
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
  it('runs data, then Auth, then completes, marking each step', async () => {
    const d = deps()
    const order: string[] = []
    d.deleteAccountData = vi.fn(async () => void order.push('data'))
    d.deleteAuthUser = vi.fn(async () => (order.push('auth'), 'deleted' as const))
    d.markStep = vi.fn(async (_user, step) => void order.push(`mark:${step}`))
    d.complete = vi.fn(async () => void order.push('complete'))

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(order).toEqual(['data', 'mark:data', 'auth', 'mark:auth', 'complete'])
  })

  it('does nothing when the job cannot be claimed', async () => {
    const d = deps({ claim: vi.fn(async () => null) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('not_claimed')
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

    expect(d.markStep).not.toHaveBeenCalled()
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
})
