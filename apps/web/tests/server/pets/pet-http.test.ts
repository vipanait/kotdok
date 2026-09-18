import { describe, expect, it, vi } from 'vitest'
import { petFailureResponse } from '@/server/pets/pet-http'

describe('what a failed pet request tells the caller', () => {
  it('keeps the storage error out of the response', async () => {
    // PostgREST says things like `invalid input syntax for type uuid: "x"`, or
    // names a table and a constraint. That is the inside of the system, and a
    // caller who sent a bad id learns nothing useful from it.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = petFailureResponse(
      'storage_error',
      'invalid input syntax for type uuid: "not-a-uuid"',
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Storage error' })
  })

  it('still separates the cases a caller can act on', () => {
    expect(petFailureResponse('not_found').status).toBe(404)
    expect(petFailureResponse('account_deleting').status).toBe(403)
  })
})
