import type { TxStatus } from '@/shared/types/billing'

/** Format cents in the given currency. Expects an ISO 4217 code; falls back to ru-RU for unknown codes. */
export function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('ru-RU')} ${currency}`
  }
}

export const TX_STATUS_LABEL: Record<TxStatus, string> = {
  created: 'Создан',
  pending: 'Ожидает оплаты',
  authorized: 'Авторизован',
  succeeded: 'Оплачен',
  failed: 'Ошибка',
  canceled: 'Отменён',
  refunded: 'Возврат',
}

export const TX_STATUS_STYLE: Record<TxStatus, string> = {
  created: 'bg-gray-100 text-gray-700',
  pending: 'bg-blue-50 text-blue-700',
  authorized: 'bg-indigo-50 text-indigo-700',
  succeeded: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
  canceled: 'bg-gray-100 text-gray-600',
  refunded: 'bg-amber-50 text-amber-700',
}

/** Whether the status is terminal (no further changes expected). */
export function isTerminalStatus(status: TxStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled' || status === 'refunded'
}
