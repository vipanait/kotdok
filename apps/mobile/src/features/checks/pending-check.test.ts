import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetPendingCheck,
  pendingCheck,
  rememberFinishedCheck,
  rememberPendingCheck,
  takeFinishedCheck,
} from './pending-check'

const ANNA = 'ac1d7d2e-0000-4000-8000-000000000001'
const BORIS = 'ac1d7d2e-0000-4000-8000-000000000002'

describe('the analysis that outlives the screen', () => {
  beforeEach(forgetPendingCheck)

  it('hands the job back so the wait can be picked up again', () => {
    rememberPendingCheck(ANNA, 'job-1')
    expect(pendingCheck(ANNA)).toBe('job-1')
  })

  it('belongs to the account that paid for it', () => {
    rememberPendingCheck(ANNA, 'job-1')
    // Another account on the same phone must not be shown Anna's answer.
    expect(pendingCheck(BORIS)).toBeNull()
    expect(pendingCheck(null)).toBeNull()

    rememberFinishedCheck(ANNA, 'check-1')
    expect(takeFinishedCheck(BORIS)).toBeNull()
    expect(takeFinishedCheck(null)).toBeNull()
    expect(takeFinishedCheck(ANNA)).toBe('check-1')
  })

  it('gives a finished result once, so it does not reopen on every visit', () => {
    rememberFinishedCheck(ANNA, 'check-1')
    expect(takeFinishedCheck(ANNA)).toBe('check-1')
    expect(takeFinishedCheck(ANNA)).toBeNull()
  })

  it('stops waiting for a job that has finished', () => {
    rememberPendingCheck(ANNA, 'job-1')
    rememberFinishedCheck(ANNA, 'check-1')
    expect(pendingCheck(ANNA)).toBeNull()
  })

  it('forgets everything when the wait is over for another reason', () => {
    rememberPendingCheck(ANNA, 'job-1')
    forgetPendingCheck()
    expect(pendingCheck(ANNA)).toBeNull()

    rememberFinishedCheck(ANNA, 'check-1')
    forgetPendingCheck()
    expect(takeFinishedCheck(ANNA)).toBeNull()
  })
})
