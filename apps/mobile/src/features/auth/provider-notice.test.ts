import { describe, expect, it } from 'vitest'
import { providerNoticeFor } from './provider-notice'

describe('what the screens say after the provider', () => {
  it('says nothing when the session arrived', () => {
    expect(providerNoticeFor({ kind: 'session' })).toBeNull()
  })

  it('reports a cancellation without dressing it as a fault', () => {
    expect(providerNoticeFor({ kind: 'cancelled' })).toEqual({ text: 'Вход отменён', tone: 'info' })
  })

  it('passes a failure through as an error', () => {
    expect(providerNoticeFor({ kind: 'failed', message: 'Не удалось завершить вход.' })).toEqual({
      text: 'Не удалось завершить вход.',
      tone: 'error',
    })
  })
})
