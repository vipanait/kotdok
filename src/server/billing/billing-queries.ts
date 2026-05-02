import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

export function listActivePackages(supabase: SupabaseService) {
  return supabase
    .from('packages')
    .select('id, code, name, units, unit_price, amount, currency, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
}

export function listPaymentMethods(supabase: SupabaseService, userId: string) {
  return supabase
    .from('payment_methods')
    .select('id, provider, brand, last4, exp_month, exp_year, is_default, created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
}

export function softDeletePaymentMethod(
  supabase: SupabaseService,
  userId: string,
  paymentMethodId: string,
) {
  return supabase
    .from('payment_methods')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', paymentMethodId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .single()
}

export function listTransactions(supabase: SupabaseService, userId: string) {
  return supabase
    .from('transactions')
    .select(`
      id, provider, amount, currency,
      units_total, unit_price,
      current_status, created_at, updated_at,
      package:packages ( name, code )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
}

export function getTransaction(
  supabase: SupabaseService,
  userId: string,
  transactionId: string,
) {
  return supabase
    .from('transactions')
    .select(`
      id, provider, amount, currency,
      units_total, unit_price,
      current_status, created_at, updated_at,
      package:packages ( name, code )
    `)
    .eq('id', transactionId)
    .eq('user_id', userId)
    .single()
}
