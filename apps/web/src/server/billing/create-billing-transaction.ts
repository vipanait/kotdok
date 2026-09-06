import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import type { PaymentProviderName } from '@/shared/types/billing'

interface CreateBillingTransactionInput {
  userId: string
  provider: PaymentProviderName
  packageId: string
  metadata?: Record<string, unknown>
  paymentMethodId?: string | null
}

export interface CreatedBillingTransaction {
  transaction_id: string
  amount: number
  currency: string
  package_name: string
}

export async function createBillingTransaction(
  supabase: ReturnType<typeof createServiceClient>,
  input: CreateBillingTransactionInput,
): Promise<CreatedBillingTransaction> {
  const { data: pkg, error: packageError } = await supabase
    .from('packages')
    .select('id, name, units, unit_price, amount, currency, is_active')
    .eq('id', input.packageId)
    .single()

  if (packageError || !pkg) {
    throw new Error(packageError?.message ?? 'package_not_found')
  }
  if (!pkg.is_active) throw new Error('package_inactive')

  const units = Number(pkg.units)
  const unitPrice = Number(pkg.unit_price)
  const amount = unitPrice * units
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert({
      user_id: input.userId,
      provider: input.provider,
      package_id: input.packageId,
      units_total: units,
      unit_price: unitPrice,
      amount,
      currency: pkg.currency,
      metadata: input.metadata ?? {},
      payment_method_id: input.paymentMethodId ?? null,
    })
    .select('id')
    .single()

  if (transactionError || !transaction) {
    throw new Error(transactionError?.message ?? 'transaction_create_failed')
  }

  const { data: event, error: eventError } = await supabase
    .from('transaction_status_events')
    .insert({
      transaction_id: transaction.id,
      status: 'created',
      reason: 'user_initiated',
    })
    .select('id')
    .single()

  if (eventError || !event) {
    throw new Error(eventError?.message ?? 'transaction_event_create_failed')
  }

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ current_status_event_id: event.id })
    .eq('id', transaction.id)

  if (updateError) throw new Error(updateError.message)

  return {
    transaction_id: transaction.id,
    amount,
    currency: pkg.currency,
    package_name: pkg.name,
  }
}
