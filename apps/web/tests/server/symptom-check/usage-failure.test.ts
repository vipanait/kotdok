import { describe, expect, it } from 'vitest'
import { usageFailure } from '@/server/symptom-check/analyze-symptom-check'

describe('when reserving a credit fails', () => {
  it('names the one case the caller can act on', () => {
    expect(usageFailure('insufficient_credits')).toEqual({
      ok: false,
      code: 'insufficient_credits',
      message: 'Not enough credits / Недостаточно credits.',
    })
  })

  it('answers anything else without repeating the database', () => {
    // `message` is handed to the caller as-is by the route, so a PostgREST
    // sentence here goes out over the wire naming tables and constraints.
    const failure = usageFailure('null value in column "user_id" of relation "credit_ledger"')

    expect(failure.code).toBe('internal_error')
    expect(failure.message).not.toContain('credit_ledger')
    expect(failure.message).toBe('An error occurred / Произошла ошибка.')
  })
})
