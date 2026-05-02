import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/server-auth'
import { getProvider } from '@/lib/payments/registry'
import { createBillingTransaction } from '@/lib/billing-transactions'

interface SavedPurchaseBody {
  package_id: string
  payment_method_id: string
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as SavedPurchaseBody
  if (!body?.package_id || !body?.payment_method_id) {
    return NextResponse.json({ error: 'package_id_and_payment_method_id_required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify payment method belongs to the user.
  const { data: pm, error: pmErr } = await supabase
    .from('payment_methods')
    .select('id, user_id, provider, provider_pm_id, deleted_at')
    .eq('id', body.payment_method_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (pmErr || !pm) {
    return NextResponse.json({ error: 'payment_method_not_found' }, { status: 404 })
  }

  let created
  try {
    created = await createBillingTransaction(supabase, {
      userId: user.id,
      provider: pm.provider,
      packageId: body.package_id,
      metadata: { flow: 'saved_card' },
      paymentMethodId: pm.id,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'create_failed' },
      { status: 500 },
    )
  }

  const txId = created.transaction_id
  const amountCents = created.amount
  const currency = created.currency
  const packageName = created.package_name

  try {
    const result = await getProvider(pm.provider).chargeSaved({
      transactionId: txId,
      userId: user.id,
      amountCents,
      currency,
      description: `Лапка — ${packageName}`,
      providerPmId: pm.provider_pm_id,
    })

    const { error: pendingErr } = await supabase.rpc('mark_transaction_pending', {
      p_transaction_id: txId,
      p_provider_payment_id: result.providerPaymentId,
    })
    if (pendingErr) throw pendingErr

    // For dummy provider there is no UI step; apply the simulated terminal
    // event directly instead of relying on background work after response.
    if (pm.provider === 'dummy') {
      const { error: applyErr } = await supabase.rpc('apply_transaction_success', {
        p_provider: pm.provider,
        p_provider_payment_id: result.providerPaymentId,
        p_provider_event_id: `dummy:${result.providerPaymentId}:succeeded`,
        p_payload: { providerPaymentId: result.providerPaymentId, status: 'succeeded' },
      })
      if (applyErr) throw applyErr
    }

    // The actual 'succeeded' state will arrive via webhook; respond with tx id
    // so the UI can poll /api/billing/transactions/[id] for confirmation.
    return NextResponse.json({ transaction_id: txId })
  } catch (err) {
    await supabase.from('transaction_status_events').insert({
      transaction_id: txId,
      status: 'failed',
      reason: 'provider_charge_error',
      payload: { message: err instanceof Error ? err.message : String(err) },
    })
    await supabase
      .from('transactions')
      .update({ current_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', txId)

    return NextResponse.json(
      { error: 'charge_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
