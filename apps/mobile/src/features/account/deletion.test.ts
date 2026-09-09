import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@lapka/shared'
import type { ApiClient } from '@lapka/shared'
import { deleteAccount, newReceiptSecret, type DeletionDeps } from './deletion'

/** Deterministic randomness, so the receipt in a failing test is readable. */
const fixedRandom = (bytes: Uint8Array) => {
  bytes.fill(0xab)
}

function deps(overrides: Partial<DeletionDeps> = {}): DeletionDeps {
  return {
    api: {
      requestReauth: vi.fn(async () => ({ token: 'proof', expires_at: '2026-09-09T12:00:00Z' })),
      requestAccountDeletion: vi.fn(async () => ({ status: 'accepted' as const })),
    } as unknown as ApiClient,
    keepReceipt: vi.fn(async () => {}),
    forgetAccount: vi.fn(async () => {}),
    random: fixedRandom,
    fallbackMessage: 'Не удалось',
    ...overrides,
  }
}

describe('the receipt secret', () => {
  it('is the shape the contract demands', () => {
    expect(newReceiptSecret(fixedRandom)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is different every time, given real randomness', () => {
    const real = (bytes: Uint8Array) => {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
    }
    expect(newReceiptSecret(real)).not.toBe(newReceiptSecret(real))
  })
})

describe('asking for the account to be deleted', () => {
  it('proves who is asking, sends, then forgets the account', async () => {
    const d = deps()

    const outcome = await deleteAccount(d)

    expect(outcome).toEqual({ kind: 'accepted', receipt: 'ab'.repeat(32) })
    expect(d.api.requestAccountDeletion).toHaveBeenCalledWith({
      receipt_secret: 'ab'.repeat(32),
      reauth_token: 'proof',
    })
    expect(d.forgetAccount).toHaveBeenCalled()
  })

  it('writes the receipt down before sending, not after', async () => {
    // The case the receipt exists for is a `202` that never arrives. One made
    // after the answer would be missing in exactly that case.
    const order: string[] = []
    const d = deps({
      keepReceipt: vi.fn(async () => {
        order.push('kept')
      }),
    })
    ;(d.api.requestAccountDeletion as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('sent')
      return { status: 'accepted' as const }
    })

    await deleteAccount(d)

    expect(order).toEqual(['kept', 'sent'])
  })

  it('does not clear the session until the request has gone', async () => {
    const order: string[] = []
    const d = deps({
      forgetAccount: vi.fn(async () => {
        order.push('forgot')
      }),
    })
    ;(d.api.requestAccountDeletion as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('sent')
      return { status: 'accepted' as const }
    })

    await deleteAccount(d)

    expect(order).toEqual(['sent', 'forgot'])
  })

  it('asks the person to authenticate again rather than showing them an error', async () => {
    const d = deps()
    ;(d.api.requestReauth as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('reauth_required', 401, 'too old'),
    )

    await expect(deleteAccount(d)).resolves.toEqual({ kind: 'reauth_required' })

    // Nothing was touched: no receipt, no request, no sign-out.
    expect(d.keepReceipt).not.toHaveBeenCalled()
    expect(d.api.requestAccountDeletion).not.toHaveBeenCalled()
    expect(d.forgetAccount).not.toHaveBeenCalled()
  })

  it('keeps the session when the request itself fails', async () => {
    // Signing somebody out of an account that is still there would leave them
    // unable to try again.
    const d = deps()
    ;(d.api.requestAccountDeletion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('internal_error', 500, 'no'),
    )

    await expect(deleteAccount(d)).resolves.toEqual({ kind: 'failed', message: 'Не удалось' })
    expect(d.forgetAccount).not.toHaveBeenCalled()
  })

  it('does not leak the server wording to the screen', async () => {
    const d = deps()
    ;(d.api.requestReauth as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('internal_error', 500, 'pg: relation does not exist'),
    )

    const outcome = await deleteAccount(d)
    expect(outcome).toEqual({ kind: 'failed', message: 'Не удалось' })
  })
})
