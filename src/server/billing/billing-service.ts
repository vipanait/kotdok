import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import { getProvider, isDummyProviderEnabled } from '@/server/payments/registry'
import type { DummyWebhookPayload } from '@/server/payments/dummy'
import type { PaymentProviderName } from '@/shared/types/billing'
import { createBillingTransaction } from './create-billing-transaction'

const VALID_PROVIDERS: PaymentProviderName[] = ['dummy']

export function isKnownEnabledProvider(provider: string): provider is PaymentProviderName {
  return (
    VALID_PROVIDERS.includes(provider as PaymentProviderName) &&
    (provider !== 'dummy' || isDummyProviderEnabled())
  )
}

export async function initiatePurchase(input: {
  userId: string
  packageId: string
  provider: PaymentProviderName
  savePaymentMethod: boolean
  returnBaseUrl: string
}) {
  const supabase = createServiceClient()
  const created = await createBillingTransaction(supabase, {
    userId: input.userId,
    provider: input.provider,
    packageId: input.packageId,
    metadata: { save_payment_method: input.savePaymentMethod },
  })

  const txId = created.transaction_id

  try {
    const initResult = await getProvider(input.provider).initPayment({
      transactionId: txId,
      userId: input.userId,
      amountCents: created.amount,
      currency: created.currency,
      description: `Лапка — ${created.package_name}`,
      returnUrl: `${input.returnBaseUrl}/${txId}`,
      savePaymentMethod: input.savePaymentMethod,
    })

    const { error } = await supabase.rpc('mark_transaction_pending', {
      p_transaction_id: txId,
      p_provider_payment_id: initResult.providerPaymentId,
    })
    if (error) throw error

    return {
      transaction_id: txId,
      redirect_url: initResult.redirectUrl,
    }
  } catch (err) {
    await markTransactionFailed(txId, 'provider_init_error', err)
    throw new Error(`provider_init_failed:${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function chargeSavedPayment(input: {
  userId: string
  packageId: string
  paymentMethodId: string
}) {
  const supabase = createServiceClient()
  const { data: paymentMethod } = await supabase
    .from('payment_methods')
    .select('id, user_id, provider, provider_pm_id, deleted_at')
    .eq('id', input.paymentMethodId)
    .eq('user_id', input.userId)
    .is('deleted_at', null)
    .single()

  if (!paymentMethod) throw new Error('payment_method_not_found')

  const created = await createBillingTransaction(supabase, {
    userId: input.userId,
    provider: paymentMethod.provider,
    packageId: input.packageId,
    metadata: { flow: 'saved_card' },
    paymentMethodId: paymentMethod.id,
  })

  const txId = created.transaction_id

  try {
    const result = await getProvider(paymentMethod.provider).chargeSaved({
      transactionId: txId,
      userId: input.userId,
      amountCents: created.amount,
      currency: created.currency,
      description: `Лапка — ${created.package_name}`,
      providerPmId: paymentMethod.provider_pm_id,
    })

    const { error } = await supabase.rpc('mark_transaction_pending', {
      p_transaction_id: txId,
      p_provider_payment_id: result.providerPaymentId,
    })
    if (error) throw error

    if (paymentMethod.provider === 'dummy') {
      const { error: applyError } = await supabase.rpc('apply_transaction_success', {
        p_provider: paymentMethod.provider,
        p_provider_payment_id: result.providerPaymentId,
        p_provider_event_id: `dummy:${result.providerPaymentId}:succeeded`,
        p_payload: { providerPaymentId: result.providerPaymentId, status: 'succeeded' },
      })
      if (applyError) throw applyError
    }

    return { transaction_id: txId }
  } catch (err) {
    await markTransactionFailed(txId, 'provider_charge_error', err)
    throw new Error(`charge_failed:${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function applyProviderWebhook(
  provider: PaymentProviderName,
  rawBody: string,
  headers: Headers,
) {
  const event = await getProvider(provider).parseWebhook(rawBody, headers)
  if (!event) return { applied: false }

  const supabase = createServiceClient()
  if (event.status === 'succeeded') {
    const { error } = await supabase.rpc('apply_transaction_success', {
      p_provider: provider,
      p_provider_payment_id: event.providerPaymentId,
      p_provider_event_id: event.providerEventId,
      p_payload: event.payload as Record<string, unknown>,
      p_rebill_id: event.rebillId ?? null,
      p_card_last4: event.cardLast4 ?? null,
      p_card_brand: event.cardBrand ?? null,
      p_card_exp_month: event.cardExpMonth ?? null,
      p_card_exp_year: event.cardExpYear ?? null,
    })
    if (error) throw error
  } else {
    const { error } = await supabase.rpc('apply_transaction_terminal', {
      p_provider: provider,
      p_provider_payment_id: event.providerPaymentId,
      p_provider_event_id: event.providerEventId,
      p_status: event.status,
      p_reason: event.reason ?? null,
      p_payload: event.payload as Record<string, unknown>,
    })
    if (error) throw error
  }

  return { applied: true }
}

export async function confirmDummyCheckout(input: {
  userId: string
  transactionId: string
  outcome: 'succeeded' | 'failed' | 'canceled'
  saveCard?: boolean
}) {
  const supabase = createServiceClient()
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, user_id, provider, provider_payment_id, payment_method_id')
    .eq('id', input.transactionId)
    .single()

  if (!tx || tx.user_id !== input.userId || tx.provider !== 'dummy') {
    throw new Error('not_found')
  }
  if (!tx.provider_payment_id) {
    throw new Error('transaction_not_initialized')
  }

  const payload: DummyWebhookPayload = {
    providerPaymentId: tx.provider_payment_id,
    status: input.outcome,
    reason: input.outcome === 'failed' ? 'simulated_decline' : undefined,
  }

  if (input.outcome === 'succeeded' && input.saveCard && !tx.payment_method_id) {
    payload.rebillId = `dummy_pm_${Math.random().toString(36).slice(2, 10)}`
    payload.cardLast4 = '4242'
    payload.cardBrand = 'Visa'
    payload.cardExpMonth = 12
    payload.cardExpYear = new Date().getFullYear() + 3
  }

  const providerEventId = `dummy:${tx.provider_payment_id}:${input.outcome}`
  if (input.outcome === 'succeeded') {
    const { error } = await supabase.rpc('apply_transaction_success', {
      p_provider: 'dummy',
      p_provider_payment_id: tx.provider_payment_id,
      p_provider_event_id: providerEventId,
      p_payload: payload,
      p_rebill_id: payload.rebillId ?? null,
      p_card_last4: payload.cardLast4 ?? null,
      p_card_brand: payload.cardBrand ?? null,
      p_card_exp_month: payload.cardExpMonth ?? null,
      p_card_exp_year: payload.cardExpYear ?? null,
    })
    if (error) throw error
  } else {
    const { error } = await supabase.rpc('apply_transaction_terminal', {
      p_provider: 'dummy',
      p_provider_payment_id: tx.provider_payment_id,
      p_provider_event_id: providerEventId,
      p_status: input.outcome,
      p_reason: payload.reason ?? null,
      p_payload: payload,
    })
    if (error) throw error
  }

  return { ok: true }
}

async function markTransactionFailed(txId: string, reason: string, err: unknown) {
  const supabase = createServiceClient()
  await supabase.from('transaction_status_events').insert({
    transaction_id: txId,
    status: 'failed',
    reason,
    payload: { message: err instanceof Error ? err.message : String(err) },
  })
  await supabase
    .from('transactions')
    .update({ current_status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', txId)
}
