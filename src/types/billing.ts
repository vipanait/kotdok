export type PaymentProviderName = 'tinkoff' | 'stripe' | 'yookassa'

export type TxStatus =
  | 'created'
  | 'pending'
  | 'authorized'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded'

export type CreditReason = 'purchase' | 'usage' | 'refund' | 'admin_grant' | 'signup_bonus'

export interface Package {
  id: string
  code: string
  name: string
  units: number
  unit_price_cents: number
  price_cents: number
  currency: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  provider: PaymentProviderName
  provider_payment_id: string | null
  package_id: string
  units_total: number
  unit_price_cents: number
  amount_cents: number
  currency: string
  current_status: TxStatus
  current_status_event_id: string | null
  payment_method_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TransactionStatusEvent {
  id: string
  transaction_id: string
  status: TxStatus
  reason: string | null
  provider_event_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface PaymentMethod {
  id: string
  user_id: string
  provider: PaymentProviderName
  provider_pm_id: string
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
  is_default: boolean
  created_at: string
  deleted_at: string | null
}

export interface CreditLedgerEntry {
  id: string
  user_id: string
  delta: number
  reason: CreditReason
  transaction_id: string | null
  symptom_check_id: string | null
  balance_after: number
  created_at: string
}
