import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceClient } from '@/server/supabase/server'
import {
  resolveExtraCheckRequest,
  submitExtraCheckRequest,
} from '@/server/extra-check/extra-check-service'
import { sendExtraCheckRequestToTelegram } from '@/server/extra-check/telegram'

vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/server/extra-check/telegram', () => ({
  sendExtraCheckRequestToTelegram: vi.fn(),
}))

/** The limiter runs before the work; an allowed verdict keeps it out of the way. */
const allowedRateLimit = {
  data: { allowed: true, remaining: 4, reset_at: '2026-09-06T13:00:00.000Z' },
  error: null,
}

/** Every service starts by loading the account, so each mock has to answer it. */
function activeProfile(userId: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: { id: userId, status: 'active', role: 'user', locale: 'ru', credits: 0 },
      error: null,
    })),
  }
  return builder
}

describe('extra-check-service', () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset()
    vi.mocked(sendExtraCheckRequestToTelegram).mockReset()
  })

  it('creates a request, sends Telegram message and stores Telegram ids', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'consume_rate_limit') return allowedRateLimit
      if (name === 'create_extra_check_request') {
        return { data: { request_id: 'req-1' }, error: null }
      }
      throw new Error(`Unexpected rpc: ${name}`)
    })
    const countNeq = vi.fn(async () => ({ count: 3, error: null }))
    const countEq = vi.fn(() => ({ neq: countNeq }))
    const select = vi.fn(() => ({ eq: countEq }))
    const updateEqSecond = vi.fn(async () => ({ error: null }))
    const updateEqFirst = vi.fn(() => ({ eq: updateEqSecond }))
    const update = vi.fn(() => ({ eq: updateEqFirst }))
    const from = vi.fn((table: string) =>
      table === 'profiles' ? activeProfile('user-1') : { select, update },
    )
    vi.mocked(createServiceClient).mockReturnValue({ rpc, from } as never)
    vi.mocked(sendExtraCheckRequestToTelegram).mockResolvedValue({
      chatId: 123,
      messageId: 777,
    })

    const result = await submitExtraCheckRequest('user-1')

    expect(result).toEqual({ ok: true, requestId: 'req-1' })
    expect(rpc).toHaveBeenCalledWith('create_extra_check_request', { p_user_id: 'user-1' })
    expect(sendExtraCheckRequestToTelegram).toHaveBeenCalledWith({
      requestId: 'req-1',
      userId: 'user-1',
      previousRequestsCount: 3,
    })
    expect(from).toHaveBeenCalledWith('extra_check_requests')
    expect(update).toHaveBeenCalled()
  })

  it('deletes pending request when Telegram delivery fails', async () => {
    const rpc = vi.fn(async (name: string) =>
      name === 'consume_rate_limit'
        ? allowedRateLimit
        : { data: { request_id: 'req-2' }, error: null },
    )
    const countNeq = vi.fn(async () => ({ count: 1, error: null }))
    const countEq = vi.fn(() => ({ neq: countNeq }))
    const select = vi.fn(() => ({ eq: countEq }))
    const deleteEqSecond = vi.fn(async () => ({ error: null }))
    const deleteEqFirst = vi.fn(() => ({ eq: deleteEqSecond }))
    const remove = vi.fn(() => ({ eq: deleteEqFirst }))
    const updateEqSecond = vi.fn(async () => ({ error: null }))
    const updateEqFirst = vi.fn(() => ({ eq: updateEqSecond }))
    const update = vi.fn(() => ({ eq: updateEqFirst }))
    const from = vi.fn((table: string) =>
      table === 'profiles' ? activeProfile('user-1') : { select, update, delete: remove },
    )
    vi.mocked(createServiceClient).mockReturnValue({ rpc, from } as never)
    vi.mocked(sendExtraCheckRequestToTelegram).mockRejectedValue(new Error('network_error'))

    await expect(submitExtraCheckRequest('user-2')).resolves.toEqual({
      ok: false,
      reason: 'telegram_dispatch_failed',
      message: 'network_error',
    })
    expect(remove).toHaveBeenCalled()
  })

  it.each(['pending_request_exists', 'credits_remaining', 'profile_not_found'] as const)(
    'names the refusal the create rpc raised: %s',
    async (raised) => {
      const rpc = vi.fn(async (name: string) =>
        name === 'consume_rate_limit' ? allowedRateLimit : { data: null, error: { message: raised } },
      )
      const from = vi.fn(() => activeProfile('user-3'))
      vi.mocked(createServiceClient).mockReturnValue({ rpc, from } as never)

      await expect(submitExtraCheckRequest('user-3')).resolves.toEqual({ ok: false, reason: raised })
    },
  )

  it('reports any other database failure as a storage error, with the driver message for the log', async () => {
    const rpc = vi.fn(async (name: string) =>
      name === 'consume_rate_limit' ? allowedRateLimit : { data: null, error: { message: 'connection reset' } },
    )
    const from = vi.fn(() => activeProfile('user-3'))
    vi.mocked(createServiceClient).mockReturnValue({ rpc, from } as never)

    await expect(submitExtraCheckRequest('user-3')).resolves.toEqual({
      ok: false,
      reason: 'storage_error',
      message: 'connection reset',
    })
  })

  it('refuses before any work when the allowance is spent', async () => {
    const rpc = vi.fn(async () => ({
      data: { allowed: false, remaining: 0, reset_at: '2026-09-06T13:00:00.000Z' },
      error: null,
    }))
    const from = vi.fn(() => activeProfile('user-4'))
    vi.mocked(createServiceClient).mockReturnValue({ rpc, from } as never)

    await expect(submitExtraCheckRequest('user-4')).resolves.toEqual({ ok: false, reason: 'rate_limited' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('refuses an account that is being deleted', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'user-5', status: 'deleting', role: 'user', locale: 'ru', credits: 0 },
        error: null,
      })),
    }
    const rpc = vi.fn()
    vi.mocked(createServiceClient).mockReturnValue({ rpc, from: vi.fn(() => builder) } as never)

    await expect(submitExtraCheckRequest('user-5')).resolves.toEqual({ ok: false, reason: 'account_deleting' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('resolves request through rpc', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'resolve_extra_check_request') {
        return {
          data: { status: 'approved', request_status: 'approved', new_balance: 1 },
          error: null,
        }
      }
      throw new Error(`Unexpected rpc: ${name}`)
    })
    vi.mocked(createServiceClient).mockReturnValue({ rpc } as never)

    const result = await resolveExtraCheckRequest({
      requestId: 'req-4',
      action: 'approve',
      adminTelegramId: 42,
      adminUsername: 'admin',
    })

    expect(result).toEqual({
      status: 'approved',
      requestStatus: 'approved',
      newBalance: 1,
    })
  })
})
