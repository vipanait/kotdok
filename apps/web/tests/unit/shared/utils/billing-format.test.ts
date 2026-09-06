import { describe, expect, it } from 'vitest'
import { formatMoney, isTerminalStatus } from '@/shared/utils/billing-format'
import type { TxStatus } from '@/shared/types/billing'

describe('formatMoney', () => {
  it('formats cents as rubles', () => {
    const formatted = formatMoney(129000, 'RUB')

    expect(formatted).toContain('1')
    expect(formatted).toContain('290')
    expect(formatted).toContain('₽')
  })

  it('falls back for unknown currency codes', () => {
    expect(formatMoney(12345, 'XXX_TEST')).toBe('123,45 XXX_TEST')
  })
})

describe('isTerminalStatus', () => {
  it('marks only final transaction statuses as terminal', () => {
    const statuses: Record<TxStatus, boolean> = {
      created: false,
      pending: false,
      authorized: false,
      succeeded: true,
      failed: true,
      canceled: true,
      refunded: true,
    }

    for (const [status, terminal] of Object.entries(statuses) as [TxStatus, boolean][]) {
      expect(isTerminalStatus(status)).toBe(terminal)
    }
  })
})
