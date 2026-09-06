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

    expect(result).toEqual({ requestId: 'req-1' })
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
    const rpc = vi.fn(async () => ({ data: { request_id: 'req-2' }, error: null }))
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

    await expect(submitExtraCheckRequest('user-2')).rejects.toThrow('telegram_dispatch_failed:network_error')
    expect(remove).toHaveBeenCalled()
  })

  it('passes through conflict errors from create rpc', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'pending_request_exists' },
    }))
    const from = vi.fn(() => activeProfile('user-3'))
    vi.mocked(createServiceClient).mockReturnValue({ rpc, from } as never)

    await expect(submitExtraCheckRequest('user-3')).rejects.toThrow('pending_request_exists')
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
